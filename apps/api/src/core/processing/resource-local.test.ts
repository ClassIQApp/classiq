import { runMigrations } from "../../db/migrate.ts";
import { createUploadRoutes } from "../../routes/uploads/index.ts";
import { ContentIndexService } from "../content-index/content-index-service.ts";
import { PostgresContentIndexRepository } from "../content-index/postgres-content-index-repository.ts";
import { ResourceContentIndexer } from "../content-index/resource-content-indexer.ts";
import { createTestPdf } from "../content-index/test-pdf.ts";
import { PostgresUploadRepository } from "../uploads/postgres-upload-repository.ts";
import { S3UploadStorage } from "../uploads/s3-upload-storage.ts";
import { ContinuationRunner } from "./continuation-runner.ts";
import { lecturePipeline } from "./lecture-pipeline.ts";
import { PostgresProcessingRepository } from "./postgres-processing-repository.ts";
import { ProcessingService } from "./processing-service.ts";
import { extractResourceStage, resourcePipeline, resourceProjectionHandlers, resourceStateSchema } from "./resource-pipeline.ts";
import { sqsPipelineStarter } from "./sqs-pipeline-starter.ts";
import { CreateBucketCommand, DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import {
    CreateQueueCommand,
    DeleteMessageCommand,
    DeleteQueueCommand,
    ReceiveMessageCommand,
    SendMessageCommand,
    SQSClient,
} from "@aws-sdk/client-sqs";
import { Hono, type MiddlewareHandler } from "hono";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, it } from "vitest";

const allowTestRequest: MiddlewareHandler = async (_, next) => next();

it.skipIf(process.env.PROCESSING_TEST_LOCAL !== "1")(
    "uploads and asynchronously extracts isolated resources with real local dependencies",
    async () => {
        const suffix = randomUUID().replaceAll("-", "");
        const schema = `resource_${suffix}`;
        const bucket = `processing-${suffix}`;
        const db = new Pool({ connectionString: "postgres://classiq:classiq@localhost:5432/classiq", options: `-c search_path=${schema}` });
        const credentials = { accessKeyId: "classiq", secretAccessKey: "classiq-local" };
        const s3 = new S3Client({ region: "us-east-1", endpoint: "http://localhost:9100", forcePathStyle: true, credentials });
        const sqs = new SQSClient({ region: "us-east-1", endpoint: "http://localhost:9324", credentials });
        let queueUrl: string | undefined;
        let deliveries = 0;
        let reads = 0;
        let failHandoff = false;
        try {
            await db.query(`CREATE SCHEMA ${schema}`);
            await runMigrations(db);
            await s3.send(new CreateBucketCommand({ Bucket: bucket }));
            const queue = await sqs.send(new CreateQueueCommand({ QueueName: `processing-${suffix}` }));
            queueUrl = queue.QueueUrl!;
            const course = await db.query("INSERT INTO courses(name, slug) VALUES ('Local processing', 'local') RETURNING id");
            const courseId = String(course.rows[0].id);
            const lecture = await db.query("INSERT INTO lectures(fk_course_id) VALUES ($1) RETURNING id", [courseId]);
            const lectureId = String(lecture.rows[0].id);
            const uploads = new PostgresUploadRepository(db);
            const storage = new S3UploadStorage({ bucketName: bucket, region: "us-east-1", serverSideEncryption: false }, s3);
            const processing = new PostgresProcessingRepository(db);
            const service = new ProcessingService(
                processing,
                sqsPipelineStarter(sqs, queueUrl, { lecture: lecturePipeline, resource: resourcePipeline }),
            );
            const content = new PostgresContentIndexRepository(db);
            const runner = new ContinuationRunner(
                resourcePipeline,
                resourceProjectionHandlers(processing, async (input, context) => {
                    const guarded = new PostgresContentIndexRepository(db, (client) =>
                        processing.guard(client, { kind: "resource", ...input }, context.runId),
                    );

                    return extractResourceStage(
                        uploads,
                        {
                            read: async (asset) => {
                                reads++;

                                return storage.read(asset);
                            },
                        },
                        content,
                        new ResourceContentIndexer(new ContentIndexService(guarded)),
                    )(input, context);
                }),
                resourceStateSchema,
                async (body, delay) => {
                    if (failHandoff) {
                        failHandoff = false;
                        throw new Error("Injected successor queue failure");
                    }
                    await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body, DelaySeconds: delay }));
                },
                () => {},
            );
            const app = new Hono().route(
                "/courses",
                createUploadRoutes({
                    requireCourseRole: () => allowTestRequest,
                    getRepository: () => uploads,
                    getStorage: () => storage,
                    startResource: (asset) =>
                        service.start({ kind: "resource", courseId, resourceId: asset.resourceId! }, ["extraction"], 600),
                    resourceProcessing: (asset) => processing.stages({ kind: "resource", courseId, resourceId: asset.resourceId! }),
                }),
            );
            function completeResource(resourceId: string, uploadId: string) {
                return app.request(`/courses/${courseId}/resources/${resourceId}/complete`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ uploadId }),
                });
            }
            async function count(table: "processing_runs" | "content_chunks") {
                const result = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`);

                return result.rows[0]!.count;
            }
            const resources = [];
            for (const data of [
                createTestPdf(["Cell membranes and osmosis", "Ribosomes build proteins"]),
                createTestPdf([""]),
                new TextEncoder().encode("corrupt PDF"),
            ]) {
                const asset = await uploads.initiate("resource", courseId, {
                    name: "notes.pdf",
                    contentType: "application/pdf",
                    contentLength: data.length,
                    lectureId,
                });
                const ticket = await storage.ticket(asset);
                const uploaded = await fetch(ticket.url, { method: "PUT", headers: ticket.headers, body: Buffer.from(data) });
                expect(uploaded.status).toBe(200);
                const complete = completeResource.bind(undefined, asset.resourceId!, asset.uploadId);
                const responses = await Promise.all([complete(), complete()]);
                expect(responses.map((response) => response.status)).toEqual([200, 200]);
                expect(reads).toBe(0); // Completion only sends the first continuation.
                resources.push({ asset, complete });
            }
            expect(await count("processing_runs")).toBe(3);
            failHandoff = true;
            let handoffFailures = 0;
            async function drain() {
                while (deliveries < 100) {
                    const response = await sqs.send(
                        new ReceiveMessageCommand({ QueueUrl: queueUrl, MaxNumberOfMessages: 1, WaitTimeSeconds: 1, VisibilityTimeout: 0 }),
                    );
                    const message = response.Messages?.[0];
                    if (!message) break;
                    deliveries++;
                    try {
                        await runner.process(message.Body!);
                        await runner.process(message.Body!);
                        await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));
                    } catch (error) {
                        expect(String(error)).toContain("Injected successor queue failure");
                        handoffFailures++;
                    }
                }
            }
            await drain();
            expect(deliveries).toBeLessThan(100);
            expect(handoffFailures).toBe(1);
            const subjects = resources.map(({ asset }) => ({ kind: "resource", courseId, resourceId: asset.resourceId! }) as const);
            expect(await processing.current(subjects[0]!)).toMatchObject({ status: "succeeded" });
            for (const subject of subjects.slice(1)) {
                expect(await processing.current(subject)).toMatchObject({ status: "failed", error_code: "RESOURCE_EXTRACTION_FAILED" });
            }
            expect(await content.findSource(subjects[1]!)).toMatchObject({
                status: "failed",
                statusMessage: expect.stringContaining("no extractable text"),
            });
            expect(await count("content_chunks")).toBe(2);
            const untouchedLecture = await db.query("SELECT status FROM lectures WHERE id = $1", [lectureId]);
            expect(untouchedLecture.rows[0].status).toBe("pending");
            const listed = await app.request(`/courses/${courseId}/resources`);
            expect(await listed.json()).toMatchObject({
                items: expect.arrayContaining([expect.objectContaining({ processing: [expect.objectContaining({ status: "failed" })] })]),
            });
            await resources[0]!.complete();
            expect(await count("processing_runs")).toBe(3);
            await resources[1]!.complete();
            expect(await processing.current(subjects[1]!)).toMatchObject({ number: 2 });
            await drain();
            expect(await processing.current(subjects[1]!)).toMatchObject({ number: 2, status: "failed" });
            expect(await count("content_chunks")).toBe(2);
            const rejectedAsset = await uploads.initiate("resource", courseId, {
                name: "queue-failure.pdf",
                contentType: "application/pdf",
                contentLength: 10,
            });
            await uploads.complete(rejectedAsset);
            const unavailable = new ProcessingService(
                processing,
                sqsPipelineStarter(sqs, `${queueUrl}-missing`, { lecture: lecturePipeline, resource: resourcePipeline }),
            );
            expect(
                await unavailable.start({ kind: "resource", courseId, resourceId: rejectedAsset.resourceId! }, ["extraction"], 600),
            ).toMatchObject({ status: "failed", error_code: "START_FAILED" });
            console.log(
                JSON.stringify({ localResourceIntegration: { deliveries, reads, handoffFailures, resources: 3, indexedChunks: 2 } }),
            );
        } finally {
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
        }
    },
    30_000,
);
