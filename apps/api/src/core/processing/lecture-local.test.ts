import { createApp } from "../../app.ts";
import { runMigrations } from "../../db/migrate.ts";
import { LlmService } from "../ai/llm-service.ts";
import { ContentIndexService } from "../content-index/content-index-service.ts";
import { PostgresContentIndexRepository } from "../content-index/postgres-content-index-repository.ts";
import { FixtureLlmFacade } from "../lecture-content/fixture-llm-facade.ts";
import { PostgresLectureContentRepository } from "../lecture-content/postgres-lecture-content-repository.ts";
import { FixtureRecordingNormalizer } from "../recording/fixture-normalizer.ts";
import { PostgresRecordingRepository } from "../recording/postgres-recording-repository.ts";
import { FixtureTranscriptionProvider } from "../transcript/fixture-transcription-provider.ts";
import { PostgresUploadRepository } from "../uploads/postgres-upload-repository.ts";
import { S3UploadStorage } from "../uploads/s3-upload-storage.ts";
import { ContinuationRunner } from "./continuation-runner.ts";
import { lectureHandlers, lecturePipeline, lectureStateSchema } from "./lecture-pipeline.ts";
import { PostgresProcessingRepository } from "./postgres-processing-repository.ts";
import { resourcePipeline } from "./resource-pipeline.ts";
import { sqsPipelineStarter } from "./sqs-pipeline-starter.ts";
import { CreateBucketCommand, DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import {
    CreateQueueCommand,
    DeleteQueueCommand,
    ReceiveMessageCommand,
    DeleteMessageCommand,
    SendMessageCommand,
    SQSClient,
} from "@aws-sdk/client-sqs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { z } from "zod";

it.skipIf(process.env.PROCESSING_TEST_LOCAL !== "1")(
    "verifies real uploaded recording and runs fixture lecture through ElasticMQ",
    async () => {
        const suffix = randomUUID().replaceAll("-", "");
        const schema = `lecture_local_${suffix}`;
        const bucket = `lecture-${suffix}`;
        const db = new Pool({ connectionString: "postgres://classiq:classiq@localhost:5432/classiq", options: `-c search_path=${schema}` });
        const credentials = { accessKeyId: "classiq", secretAccessKey: "classiq-local" };
        const s3 = new S3Client({ region: "us-east-1", endpoint: "http://localhost:9100", forcePathStyle: true, credentials });
        const sqs = new SQSClient({ region: "us-east-1", endpoint: "http://localhost:9324", credentials });
        let queueUrl: string | undefined;
        let deliveries = 0;
        try {
            await db.query(`CREATE SCHEMA ${schema}`);
            await runMigrations(db);
            await s3.send(new CreateBucketCommand({ Bucket: bucket }));
            const queue = await sqs.send(new CreateQueueCommand({ QueueName: `lecture-${suffix}` }));
            queueUrl = queue.QueueUrl!;
            const course = await db.query("INSERT INTO courses(name,slug) VALUES ('Local lecture','local') RETURNING id");
            const courseId = String(course.rows[0].id);
            const lecture = await db.query("INSERT INTO lectures(fk_course_id) VALUES ($1) RETURNING id", [courseId]);
            const lectureId = String(lecture.rows[0].id);
            const subject = { kind: "lecture", courseId, lectureId } as const;
            const uploads = new PostgresUploadRepository(db);
            const storage = new S3UploadStorage({ bucketName: bucket, region: "us-east-1", serverSideEncryption: false }, s3);
            let rejectStart = true;
            const starter = sqsPipelineStarter(sqs, queueUrl, { lecture: lecturePipeline, resource: resourcePipeline });
            const app = createApp(() => db, {
                getUploadStorage: () => storage,
                getAuthConfig: () => ({
                    secret: "local-lecture-integration-secret-only-1234",
                    baseURL: "http://localhost:3000",
                    trustedOrigins: ["http://localhost:5173"],
                    production: false,
                }),
                pipelineStarter: async (request) => {
                    if (rejectStart) throw new Error("Injected queue rejection");
                    await starter(request);
                },
            });
            async function signUp(email: string) {
                const response = await app.request("/api/auth/sign-up/email", {
                    method: "POST",
                    headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
                    body: JSON.stringify({ name: email, email, password: "local-integration-only-123" }),
                });
                expect(response.status).toBe(200);
                const user = z.object({ user: z.object({ id: z.string() }) }).parse(await response.json()).user;

                return {
                    id: user.id,
                    cookie: response.headers
                        .getSetCookie()
                        .map((cookie) => cookie.split(";")[0])
                        .join("; "),
                };
            }
            const teacher = await signUp("teacher@local.test");
            const member = await signUp("member@local.test");
            const outsider = await signUp("outsider@local.test");
            await db.query("INSERT INTO course_memberships(course_id,user_id,role) VALUES ($1,$2,'teacher'),($1,$3,'member')", [
                courseId,
                teacher.id,
                member.id,
            ]);
            const root = `/courses/${courseId}/lectures/${lectureId}`;
            function request(path: string, method = "GET", body?: unknown, cookie = teacher.cookie) {
                return app.request(path, {
                    method,
                    headers: { Origin: "http://localhost:5173", Cookie: cookie, "Content-Type": "application/json" },
                    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                });
            }
            async function responseStatus(...args: Parameters<typeof request>) {
                const response = await request(...args);

                return response.status;
            }
            expect(await responseStatus(`${root}/processing`, "GET", undefined, "")).toBe(401);
            expect(await responseStatus(`${root}/processing`, "GET", undefined, outsider.cookie)).toBe(404);
            expect(await responseStatus(`${root}/processing/retry`, "POST", undefined, member.cookie)).toBe(403);
            expect(await responseStatus(`${root}/processing/retry`, "POST")).toBe(409);
            expect(await responseStatus(root, "PATCH", { status: "ready" })).toBe(400);
            const ticketResponse = await request(`${root}/recording/upload`, "POST", {
                name: "fixture.wav",
                contentType: "audio/wav",
                contentLength: 10,
            });
            expect(ticketResponse.status).toBe(201);
            const asset = (await uploads.find(courseId, "recording", lectureId))!;
            expect(await responseStatus(`${root}/recording/complete`, "POST", { uploadId: asset.uploadId })).toBe(409);
            await expect(storage.verify(asset)).rejects.toMatchObject({ code: "OBJECT_MISSING" });
            const ticket = await storage.ticket(asset);
            const uploaded = await fetch(ticket.url, { method: "PUT", headers: ticket.headers, body: Buffer.alloc(10) });
            expect(uploaded.status).toBe(200);
            await expect(storage.verify({ ...asset, contentLength: 11 })).rejects.toMatchObject({ code: "OBJECT_MISMATCH" });
            await storage.verify(asset);
            const complete = await request(`${root}/recording/complete`, "POST", { uploadId: asset.uploadId });
            expect(complete.status).toBe(200);
            expect(await complete.json()).toMatchObject({
                uploadStatus: "uploaded",
                processing: { status: "failed", error_code: "START_FAILED" },
            });
            const afterStartFailure = await request(`${root}/processing`);
            expect(await afterStartFailure.json()).toMatchObject({
                status: "uploaded",
                run: { status: "failed" },
                stages: expect.arrayContaining([
                    { stage: "summary", status: "failed", statusMessage: expect.any(String), attempts: 0, updatedAt: expect.any(String) },
                ]),
            });
            expect(await responseStatus(`${root}/recording/download`, "GET", undefined, member.cookie)).toBe(200);
            rejectStart = false;
            const processing = new PostgresProcessingRepository(db);
            const provider = new FixtureTranscriptionProvider({
                0: { pendingChecks: 1, lostCallback: true },
                1: { pendingChecks: 0, duplicateCompletion: true },
            });
            const normalizer = new FixtureRecordingNormalizer({
                durationSeconds: 3600,
                silences: [{ startSeconds: 1790, endSeconds: 1810 }],
            });
            const generationFixtures = { key_terms: { outcome: "malformed" as "malformed" | "completed" } };
            const llm = new FixtureLlmFacade(generationFixtures);
            const runner = new ContinuationRunner(
                lecturePipeline,
                lectureHandlers({
                    llm: new LlmService(llm),
                    content: (input, context) =>
                        new PostgresLectureContentRepository(db, (client) =>
                            processing.guard(
                                client,
                                { kind: "lecture", courseId: input.courseId, lectureId: input.lectureId },
                                context.runId,
                            ),
                        ),
                    processing,
                    uploads,
                    storage,
                    normalizer,
                    transcription: provider,
                    recording: (_, context) =>
                        new PostgresRecordingRepository(db, (client) => processing.guard(client, subject, context.runId)),
                    index: (_, context) =>
                        new ContentIndexService(
                            new PostgresContentIndexRepository(db, (client) => processing.guard(client, subject, context.runId)),
                        ),
                }),
                lectureStateSchema,
                async (body, delay) => {
                    await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body, DelaySeconds: delay }));
                },
                () => {},
            );
            const starts = await Promise.all(
                Array.from({ length: 8 }, () => request(`${root}/recording/complete`, "POST", { uploadId: asset.uploadId })),
            );
            const startRuns = await Promise.all(
                starts.map(
                    async (response) => z.object({ processing: z.object({ id: z.string() }) }).parse(await response.json()).processing.id,
                ),
            );
            expect(new Set(startRuns).size).toBe(1);
            const observed: Record<string, number> = {};
            async function drain() {
                const deadline = Date.now() + 30_000;
                const deliveryLimit = deliveries + 600;
                while (deliveries < deliveryLimit && Date.now() < deadline) {
                    const response = await sqs.send(
                        new ReceiveMessageCommand({
                            QueueUrl: queueUrl,
                            MaxNumberOfMessages: 1,
                            WaitTimeSeconds: 1,
                            VisibilityTimeout: 30,
                        }),
                    );
                    const message = response.Messages?.[0];
                    if (!message) {
                        const current = await processing.current(subject);
                        if (current?.status !== "running") break;
                        continue;
                    }
                    const decoded = JSON.parse(message.Body!) as { runId: string; state: string };
                    const key = `${decoded.runId}:${decoded.state}`;
                    observed[key] = (observed[key] ?? 0) + 1;
                    await runner.process(message.Body!);
                    if (message.Body!.includes('"state":"SubmitChunk"') || message.Body!.includes('"state":"CollectChunk"')) {
                        await runner.process(message.Body!);
                    }
                    deliveries++;
                    await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));
                }
            }
            await drain();
            expect(await processing.current(subject)).toMatchObject({ status: "failed" });
            const failedStatus = await request(`${root}/processing`, "GET", undefined, member.cookie);
            expect(failedStatus.headers.get("Cache-Control")).toBe("private, no-store");
            expect(await failedStatus.json()).toMatchObject({ status: "failed", chunks: { total: 2, collected: 2 } });
            for (const path of ["transcript", "transcript/translations/es", "generated-content/summary"]) {
                expect(await responseStatus(`${root}/${path}`, "GET", undefined, member.cookie)).toBe(200);
                expect(await responseStatus(`${root}/${path}`, "GET", undefined, outsider.cookie)).toBe(404);
            }
            expect(await responseStatus(`${root}/generated-content/key_terms`)).toBe(404);
            const failedTermsCalls = llm.calls.key_terms;
            expect(failedTermsCalls).toBeGreaterThan(0);
            expect(failedTermsCalls).toBeLessThanOrEqual(8);
            generationFixtures.key_terms.outcome = "completed";
            expect(await responseStatus(`${root}/processing/retry`, "POST")).toBe(200);
            await drain();
            expect(await processing.current(subject)).toMatchObject({ status: "succeeded" });
            const readyStatus = await request(`${root}/processing`);
            expect(await readyStatus.json()).toMatchObject({ status: "ready" });
            expect(await responseStatus(`${root}/generated-content/key_terms`, "GET", undefined, member.cookie)).toBe(200);
            const wrongCourse = await db.query("INSERT INTO courses(name,slug) VALUES ('Other','other') RETURNING id");
            await db.query("INSERT INTO course_memberships(course_id,user_id,role) VALUES ($1,$2,'teacher')", [
                wrongCourse.rows[0].id,
                teacher.id,
            ]);
            expect(await responseStatus(`/courses/${wrongCourse.rows[0].id}/lectures/${lectureId}/transcript`)).toBe(404);
            expect(await responseStatus(`${root}/generated-content/unknown`)).toBe(400);
            expect(provider.calls.created).toBe(2);
            expect(llm.calls).toEqual({ summary: 1, key_terms: failedTermsCalls + 1 });
            const lectureStatus = await db.query("SELECT status FROM lectures WHERE id=$1", [lectureId]);
            expect(lectureStatus.rows[0].status).toBe("ready");
            const generated = await db.query("SELECT kind FROM lecture_generated_content WHERE lecture_id=$1", [lectureId]);
            expect(generated.rows).toHaveLength(2);
            expect(provider.calls.collect).toBe(2);
            const repository = new PostgresRecordingRepository(db, async () => {});
            const transcript = await repository.transcript(courseId, lectureId);
            expect(transcript?.segments).toHaveLength(2);
            const abandoned = await db.query("INSERT INTO lectures(fk_course_id) VALUES ($1) RETURNING id", [courseId]);
            const abandonedId = String(abandoned.rows[0].id);
            const abandonedAsset = await uploads.initiate("recording", courseId, {
                lectureId: abandonedId,
                name: "abandoned.wav",
                contentType: "audio/wav",
                contentLength: 10,
            });
            const abandonedTicket = await storage.ticket(abandonedAsset);
            await fetch(abandonedTicket.url, { method: "PUT", headers: abandonedTicket.headers, body: Buffer.alloc(10) });
            const abandonedRoot = `/courses/${courseId}/lectures/${abandonedId}`;
            expect(await responseStatus(`${abandonedRoot}/recording/complete`, "POST", { uploadId: abandonedAsset.uploadId })).toBe(200);
            await db.query("UPDATE processing_runs SET deadline=now()-interval '1 second' WHERE lecture_id=$1", [abandonedId]);
            const reconciled = await request(`${abandonedRoot}/processing`);
            expect(await reconciled.json()).toMatchObject({
                status: "failed",
                statusMessage: "Processing timed out. Try again.",
                run: { status: "failed" },
            });
            console.log(JSON.stringify({ lectureLocal: { deliveries, observed, provider: provider.calls, llm: llm.calls } }));
        } finally {
            if (queueUrl) await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
            const objects = await s3.send(new ListObjectsV2Command({ Bucket: bucket })).catch(() => undefined);
            if (objects?.Contents?.length)
                await s3.send(
                    new DeleteObjectsCommand({
                        Bucket: bucket,
                        Delete: { Objects: objects.Contents.map((object) => ({ Key: object.Key! })) },
                    }),
                );
            await s3.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => {});
            await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
            await db.end();
            s3.destroy();
            sqs.destroy();
        }
    },
    40_000,
);
