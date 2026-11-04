import { runMigrations } from "../../db/migrate.ts";
import { DeepSeekLlmFacade } from "../ai/facades/deepseek-llm-facade.ts";
import { LlmService } from "../ai/llm-service.ts";
import { ContentIndexService } from "../content-index/content-index-service.ts";
import { PostgresContentIndexRepository } from "../content-index/postgres-content-index-repository.ts";
import { PostgresLectureContentRepository } from "../lecture-content/postgres-lecture-content-repository.ts";
import { FfmpegRecordingNormalizer } from "../recording/ffmpeg-normalizer.ts";
import { PostgresRecordingRepository } from "../recording/postgres-recording-repository.ts";
import { S3RecordingAudio } from "../recording/s3-recording-audio.ts";
import { SonioxTranscriptionProvider } from "../transcript/soniox-transcription-provider.ts";
import { PostgresUploadRepository } from "../uploads/postgres-upload-repository.ts";
import { S3UploadStorage } from "../uploads/s3-upload-storage.ts";
import { ContinuationRunner } from "./continuation-runner.ts";
import { lectureHandlers, lecturePipeline, lectureStages, lectureStateSchema } from "./lecture-pipeline.ts";
import { PostgresContinuationInbox } from "./postgres-continuation-inbox.ts";
import { PostgresProcessingRepository } from "./postgres-processing-repository.ts";
import { ProcessingService } from "./processing-service.ts";
import { CreateBucketCommand, DeleteBucketCommand, ListObjectsV2Command, DeleteObjectsCommand, S3Client } from "@aws-sdk/client-s3";
import {
    CreateQueueCommand,
    DeleteQueueCommand,
    SendMessageCommand,
    ReceiveMessageCommand,
    DeleteMessageCommand,
    SQSClient,
} from "@aws-sdk/client-sqs";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { expect, it } from "vitest";

it.skipIf(process.env.PROCESSING_TEST_LOCAL !== "1")(
    "prepares real audio and reaches ready over real local storage/queue and controlled Soniox/LLM HTTP contracts",
    async () => {
        const suffix = randomUUID().replaceAll("-", "");
        const schema = `media_${suffix}`;
        const bucket = `media-${suffix}`;
        const directory = await mkdtemp(path.join(tmpdir(), "classiq-media-integration-"));
        const db = new Pool({ connectionString: "postgres://classiq:classiq@localhost:5432/classiq", options: `-c search_path=${schema}` });
        const credentials = { accessKeyId: "classiq", secretAccessKey: "classiq-local" };
        const s3 = new S3Client({ region: "us-east-1", endpoint: "http://localhost:9100", forcePathStyle: true, credentials });
        const sqs = new SQSClient({ region: "us-east-1", endpoint: "http://localhost:9324", credentials });
        let queueUrl: string | undefined;
        const calls = { uploads: 0, creates: 0, polls: 0, collections: 0, deletes: 0, llm: 0, deliveries: 0 };
        let reference: string | undefined;
        const server = createServer(async (request, response) => {
            try {
                const buffers: Buffer[] = [];
                for await (const part of request) buffers.push(Buffer.from(part));
                const body = Buffer.concat(buffers);
                const json = (value: unknown, status = 200) => {
                    response.writeHead(status, { "content-type": "application/json" });
                    response.end(JSON.stringify(value));
                };
                if (request.url?.startsWith("/v1/transcriptions?"))
                    return json({ transcriptions: reference ? [{ id: "job", file_id: "file", client_reference_id: reference }] : [] });
                if (request.method === "DELETE") {
                    calls.deletes++;
                    response.writeHead(204);

                    return response.end();
                }
                if (request.url === "/v1/files") {
                    const form = await new Request("http://localhost", {
                        method: "POST",
                        headers: { "content-type": request.headers["content-type"]! },
                        body,
                    }).formData();
                    const blob = form.get("file") as Blob;
                    expect(
                        Buffer.from(await blob.arrayBuffer())
                            .subarray(0, 4)
                            .toString(),
                    ).toBe("fLaC");
                    calls.uploads++;

                    return json({ id: "file" }, 201);
                }
                if (request.url === "/v1/transcriptions") {
                    calls.creates++;
                    reference = JSON.parse(body.toString()).client_reference_id;

                    return json({ id: "job" }, 201);
                }
                if (request.url?.endsWith("/transcript")) {
                    calls.collections++;

                    return json({
                        tokens: [
                            {
                                text: "Cells contain membranes.",
                                start_ms: 200,
                                end_ms: 1200,
                                language: "en",
                                speaker: "1",
                                translation_status: "original",
                            },
                            { text: "Las células contienen membranas.", translation_status: "translation" },
                        ],
                    });
                }
                if (request.url === "/v1/transcriptions/job") {
                    calls.polls++;

                    return json({ status: calls.polls === 1 ? "processing" : "completed" });
                }
                if (request.url === "/chat/completions") {
                    calls.llm++;
                    const input = JSON.parse(JSON.parse(body.toString()).messages.at(-1).content);
                    const content =
                        input.kind === "summary"
                            ? { text: "Cells contain membranes." }
                            : {
                                  terms: [
                                      {
                                          term: "Membrane",
                                          explanation: "A cell boundary.",
                                          sources: [{ startSeconds: 0.2, endSeconds: 1.2 }],
                                      },
                                  ],
                              };

                    return json({
                        id: "completion",
                        object: "chat.completion",
                        created: 1,
                        model: "deepseek-flash",
                        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(content) }, finish_reason: "stop" }],
                        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
                    });
                }
                response.writeHead(404);
                response.end();
            } catch (error) {
                response.writeHead(500);
                response.end(String(error));
            }
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Missing test HTTP address");
        const baseUrl = `http://127.0.0.1:${address.port}`;
        try {
            await db.query(`CREATE SCHEMA ${schema}`);
            await runMigrations(db);
            await s3.send(new CreateBucketCommand({ Bucket: bucket }));
            const queue = await sqs.send(new CreateQueueCommand({ QueueName: `media-${suffix}` }));
            queueUrl = queue.QueueUrl!;
            const course = await db.query("INSERT INTO courses(name,slug) VALUES ('Media','media') RETURNING id");
            const courseId = String(course.rows[0].id);
            const lecture = await db.query("INSERT INTO lectures(fk_course_id,title) VALUES ($1,'Real audio') RETURNING id", [courseId]);
            const lectureId = String(lecture.rows[0].id);
            const source = path.join(directory, "source.wav");
            await promisify(execFile)("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", source]);
            const bytes = await readFile(source);
            const uploads = new PostgresUploadRepository(db);
            const storage = new S3UploadStorage({ bucketName: bucket, region: "us-east-1", serverSideEncryption: false }, s3);
            const asset = await uploads.initiate("recording", courseId, {
                lectureId,
                name: "source.wav",
                contentType: "audio/wav",
                contentLength: bytes.length,
            });
            const ticket = await storage.ticket(asset);
            const uploaded = await fetch(ticket.url, { method: "PUT", headers: ticket.headers, body: bytes });
            expect(uploaded.status).toBe(200);
            await storage.verify(asset);
            await uploads.complete(asset);
            const subject = { kind: "lecture", courseId, lectureId } as const;
            const processing = new PostgresProcessingRepository(db);
            const inbox = new PostgresContinuationInbox(db);
            const audio = new S3RecordingAudio(s3, bucket);
            const handlers = lectureHandlers({
                processing,
                uploads,
                storage,
                normalizer: new FfmpegRecordingNormalizer(
                    { ffmpeg: "ffmpeg", ffprobe: "ffprobe" },
                    async (asset) => {
                        const ticket = await storage.download(asset);

                        return ticket.url;
                    },
                    audio,
                ),
                transcription: new SonioxTranscriptionProvider(
                    { apiKey: "local-test", model: "stt-async-v6", baseUrl: `${baseUrl}/v1` },
                    fetch,
                    audio,
                ),
                llm: new LlmService(
                    new DeepSeekLlmFacade(
                        { apiKey: "local-test", model: "deepseek-flash" },
                        { fetch: (_, init) => fetch(`${baseUrl}/chat/completions`, init) },
                    ),
                ),
                recording: (_, context) =>
                    new PostgresRecordingRepository(db, (client) => processing.guard(client, subject, context.runId)),
                content: (_, context) =>
                    new PostgresLectureContentRepository(db, (client) => processing.guard(client, subject, context.runId)),
                index: (_, context) =>
                    new ContentIndexService(
                        new PostgresContentIndexRepository(db, (client) => processing.guard(client, subject, context.runId)),
                    ),
            });
            const runner = new ContinuationRunner(
                lecturePipeline,
                handlers,
                lectureStateSchema,
                async (body) => {
                    const message = JSON.parse(body);
                    delete message.notBefore;
                    await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(message) }));
                },
                () => {},
            );
            const service = new ProcessingService(processing, (request) => runner.start(request.runId, subject, request.deadline));
            await service.start(subject, lectureStages, 14_400);
            while (calls.deliveries < 150) {
                const batch = await sqs.send(new ReceiveMessageCommand({ QueueUrl: queueUrl, WaitTimeSeconds: 1, VisibilityTimeout: 30 }));
                if (!batch.Messages?.length) break;
                for (const message of batch.Messages) {
                    calls.deliveries++;
                    await inbox.process(message.Body!, 930, () => runner.process(message.Body!));
                    if (message.Body!.includes('"state":"SubmitChunk"') || message.Body!.includes('"state":"CollectChunk"'))
                        await inbox.process(message.Body!, 930, () => runner.process(message.Body!));
                    await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));
                }
            }
            const current = await processing.current(subject);
            expect(current).toMatchObject({ status: "succeeded" });
            const recording = new PostgresRecordingRepository(db, async () => {});
            expect(await recording.chunks({ ...subject, recordingId: asset.id })).toMatchObject([
                { mediaPrepared: true, tokens: expect.any(Array) },
            ]);
            expect(await recording.transcript(courseId, lectureId)).toMatchObject({
                provider: "soniox",
                translationStatus: "succeeded",
                segments: [{ text: "Cells contain membranes.", spanish: "Las células contienen membranas." }],
            });
            expect(calls).toMatchObject({ uploads: 1, creates: 1, polls: 2, collections: 1, llm: 2 });
            expect(calls.deletes).toBeGreaterThanOrEqual(2);
            console.log(JSON.stringify({ mediaHttpIntegration: calls }));
        } finally {
            await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
            if (queueUrl) await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
            const objects = await s3.send(new ListObjectsV2Command({ Bucket: bucket })).catch(() => undefined);
            if (objects?.Contents?.length)
                await s3.send(
                    new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects.Contents.map(({ Key }) => ({ Key })) } }),
                );
            await s3.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => {});
            await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
            await db.end();
            s3.destroy();
            sqs.destroy();
            await rm(directory, { recursive: true, force: true });
        }
    },
    30_000,
);
