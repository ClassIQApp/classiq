import { runMigrations } from "../../db/migrate.ts";
import { PostgresUploadRepository } from "../uploads/postgres-upload-repository.ts";
import { ContinuationRunner } from "./continuation-runner.ts";
import { definePipeline, type StageHandler } from "./pipeline.ts";
import { PostgresContinuationInbox } from "./postgres-continuation-inbox.ts";
import { PostgresProcessingRepository } from "./postgres-processing-repository.ts";
import { ProcessingService } from "./processing-service.ts";
import { sqsPipelineStarter } from "./sqs-pipeline-starter.ts";
import {
    CreateQueueCommand,
    DeleteMessageCommand,
    DeleteQueueCommand,
    ReceiveMessageCommand,
    SendMessageCommand,
    SQSClient,
} from "@aws-sdk/client-sqs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { z } from "zod";

const definition = definePipeline({
    name: "engine-check",
    startAt: "Work",
    catch: "RecordFailure",
    timeoutSeconds: 60,
    states: {
        Work: { type: "task", timeoutSeconds: 10, next: "Finish" },
        Finish: { type: "task", timeoutSeconds: 10, next: "Done" },
        RecordFailure: { type: "task", timeoutSeconds: 10, next: "Failed" },
        Done: { type: "succeed" },
        Failed: { type: "fail" },
    },
});
const inputSchema = z.object({ kind: z.literal("resource"), courseId: z.string(), resourceId: z.string() });
type Input = z.infer<typeof inputSchema>;

it.skipIf(process.env.PROCESSING_TEST_LOCAL !== "1")(
    "recovers interrupted handoffs and duplicate deliveries using real PostgreSQL and ElasticMQ",
    async () => {
        const suffix = randomUUID().replaceAll("-", "");
        const schema = `engine_${suffix}`;
        const db = new Pool({ connectionString: "postgres://classiq:classiq@localhost:5432/classiq", options: `-c search_path=${schema}` });
        const sqs = new SQSClient({
            region: "us-east-1",
            endpoint: "http://localhost:9324",
            credentials: { accessKeyId: "classiq", secretAccessKey: "classiq-local" },
        });
        let queueUrl: string | undefined;
        try {
            await db.query(`CREATE SCHEMA ${schema}`);
            await runMigrations(db);
            await db.query("CREATE TABLE engine_outputs(run_id TEXT PRIMARY KEY REFERENCES processing_runs(id), value INTEGER NOT NULL)");
            const queue = await sqs.send(new CreateQueueCommand({ QueueName: `engine-${suffix}` }));
            queueUrl = queue.QueueUrl!;
            const course = await db.query("INSERT INTO courses(name,slug) VALUES ('Engine fixture','engine') RETURNING id");
            const courseId = String(course.rows[0].id);
            const uploads = new PostgresUploadRepository(db);
            const repository = new PostgresProcessingRepository(db);
            const starter = sqsPipelineStarter(sqs, queueUrl, { resource: definition, lecture: definition });
            const service = new ProcessingService(repository, starter);
            const inbox = new PostgresContinuationInbox(db);
            const subjects: Input[] = [];
            for (const name of ["first.pdf", "second.pdf", "third.pdf"]) {
                const asset = await uploads.initiate("resource", courseId, { name, contentType: "application/pdf", contentLength: 10 });
                await uploads.complete(asset);
                subjects.push({ kind: "resource", courseId, resourceId: asset.resourceId! });
            }
            let failedSend = false;
            let calls = 0;
            const work: StageHandler<Input> = async (input, context) => {
                calls++;
                const client = await db.connect();
                try {
                    await client.query("BEGIN");
                    await repository.guard(client, input, context.runId);
                    await client.query("INSERT INTO engine_outputs(run_id,value) VALUES($1,1) ON CONFLICT DO NOTHING", [context.runId]);
                    await client.query("COMMIT");
                } catch (error) {
                    await client.query("ROLLBACK");
                    throw error;
                } finally {
                    client.release();
                }
                await repository.stage(input, context.runId, "work", "succeeded", context.attempt);

                return input;
            };
            const enqueue = async (body: string) => {
                if (!failedSend) {
                    failedSend = true;
                    throw new Error("Injected successor handoff failure");
                }
                await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body }));
                await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body }));
            };
            const runner = new ContinuationRunner(
                definition,
                {
                    Work: work,
                    Finish: async (input, context) => {
                        await repository.succeed(input, context.runId);

                        return input;
                    },
                    RecordFailure: async (input, context) => {
                        await repository.fail(input, context.runId, "FAILED", "Fixture failed");

                        return input;
                    },
                },
                inputSchema,
                enqueue,
                () => {},
            );
            const runs = await Promise.all(subjects.map((subject) => service.start(subject, ["work"], 60)));
            let interrupted: string | undefined;
            let deliveries = 0;
            let cycles = 0;
            while (cycles++ < 40) {
                const received = await sqs.send(
                    new ReceiveMessageCommand({ QueueUrl: queueUrl, MaxNumberOfMessages: 10, VisibilityTimeout: 30 }),
                );
                if (!received.Messages?.length) break;
                for (const message of received.Messages.toReversed()) {
                    deliveries++;
                    try {
                        await inbox.process(message.Body!, 30, () => runner.process(message.Body!));
                    } catch (error) {
                        expect(error).toMatchObject({ message: "Injected successor handoff failure" });
                        interrupted = message.Body;
                    }
                    await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));
                }
                if (interrupted) {
                    const resumed = new ContinuationRunner(
                        definition,
                        {
                            Work: work,
                            Finish: async (input, context) => {
                                await repository.succeed(input, context.runId);

                                return input;
                            },
                            RecordFailure: async (input) => input,
                        },
                        inputSchema,
                        enqueue,
                        () => {},
                    );
                    const resumedInbox = new PostgresContinuationInbox(db);
                    const body = interrupted;
                    await resumedInbox.process(body, 30, () => resumed.process(body));
                    interrupted = undefined;
                }
            }
            expect(failedSend).toBe(true);
            expect(calls).toBe(4);
            expect(deliveries).toBeLessThan(40);
            const outputs = await db.query("SELECT count(*)::int AS count FROM engine_outputs");
            expect(outputs.rows[0].count).toBe(3);
            for (const [index, subject] of subjects.entries()) {
                expect(await repository.current(subject)).toMatchObject({ id: runs[index]!.id, status: "succeeded" });
                expect(await service.start(subject, ["work"], 60)).toMatchObject({ id: runs[index]!.id });
            }
        } finally {
            if (queueUrl) await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
            await db.query(`DROP SCHEMA ${schema} CASCADE`);
            await db.end();
            sqs.destroy();
        }
    },
    30_000,
);
