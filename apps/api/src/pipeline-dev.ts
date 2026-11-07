import { LlmService } from "./core/ai/llm-service.ts";
import { ContentIndexService } from "./core/content-index/content-index-service.ts";
import { PostgresContentIndexRepository } from "./core/content-index/postgres-content-index-repository.ts";
import { ResourceContentIndexer } from "./core/content-index/resource-content-indexer.ts";
import { readCourseResourceFileConfig } from "./core/course-resource/file/config.ts";
import { FixtureLlmFacade } from "./core/lecture-content/fixture-llm-facade.ts";
import { ContinuationRunner } from "./core/processing/continuation-runner.ts";
import { lecturePipeline, lectureHandlers, lectureStateSchema, lectureStages } from "./core/processing/lecture-pipeline.ts";
import { PostgresContinuationInbox } from "./core/processing/postgres-continuation-inbox.ts";
import { PostgresProcessingRepository } from "./core/processing/postgres-processing-repository.ts";
import { ProcessingService } from "./core/processing/processing-service.ts";
import {
    extractResourceStage,
    resourcePipeline,
    resourceStateSchema,
    resourceProjectionHandlers,
} from "./core/processing/resource-pipeline.ts";
import { sqsPipelineStarter } from "./core/processing/sqs-pipeline-starter.ts";
import { FixtureRecordingNormalizer } from "./core/recording/fixture-normalizer.ts";
import { FixtureTranscriptionProvider } from "./core/transcript/fixture-transcription-provider.ts";
import { PostgresUploadRepository } from "./core/uploads/postgres-upload-repository.ts";
import { S3UploadStorage } from "./core/uploads/s3-upload-storage.ts";
import { getDatabase } from "./db/client.ts";
import { lectureDependencies, liveLectureDependencies } from "./lecture-dependencies.ts";
import { S3Client } from "@aws-sdk/client-s3";
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

if (
    process.env.NODE_ENV === "production" ||
    process.env.SQS_ENDPOINT !== "http://localhost:9324" ||
    process.env.SQS_QUEUE_URL !== "http://localhost:9324/000000000000/classiq-local" ||
    process.env.S3_ENDPOINT !== "http://localhost:9100" ||
    process.env.COURSE_RESOURCE_FILES_BUCKET_NAME !== "classiq-local-files" ||
    !["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL ?? "").hostname)
) {
    throw new Error("pipeline:dev requires the default local emulators and a local database.");
}

const credentials = { accessKeyId: "classiq", secretAccessKey: "classiq-local" };
const queue = new SQSClient({ region: "us-east-1", endpoint: process.env.SQS_ENDPOINT, credentials });
const files = new S3Client({ region: "us-east-1", endpoint: process.env.S3_ENDPOINT, forcePathStyle: true, credentials });
const db = getDatabase();
const processing = new PostgresProcessingRepository(db);
const inbox = new PostgresContinuationInbox(db);
const uploads = new PostgresUploadRepository(db);
const storage = new S3UploadStorage(readCourseResourceFileConfig(process.env), files);
const runner = new ContinuationRunner(
    resourcePipeline,
    resourceProjectionHandlers(processing, async (input, context) => {
        const content = new PostgresContentIndexRepository(db, (client) =>
            processing.guard(client, { kind: "resource", ...input }, context.runId),
        );

        return extractResourceStage(
            uploads,
            storage,
            content,
            new ResourceContentIndexer(new ContentIndexService(content)),
        )(input, context);
    }),
    resourceStateSchema,
    async (body, delaySeconds) => {
        await queue.send(new SendMessageCommand({ QueueUrl: process.env.SQS_QUEUE_URL, MessageBody: body, DelaySeconds: delaySeconds }));
    },
    (transition) =>
        console.log(
            JSON.stringify(transition, (_, value: unknown) =>
                value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value,
            ),
        ),
);
const mode = process.env.PROCESSING_MODE ?? (process.env.PROCESSING_FIXTURES === "1" ? "fixture" : undefined);
if (process.env.PROCESSING_FIXTURES === "1" && mode === "live") throw new Error("Choose fixture or live processing, not both.");
if (mode !== undefined && mode !== "fixture" && mode !== "live") throw new Error("PROCESSING_MODE must be fixture or live.");
const lectureRunner = mode
    ? new ContinuationRunner(
          lecturePipeline,
          lectureHandlers(
              mode === "fixture"
                  ? lectureDependencies(db, files, {
                        llm: new LlmService(new FixtureLlmFacade()),
                        normalizer: new FixtureRecordingNormalizer({
                            durationSeconds: Number(process.env.FIXTURE_RECORDING_SECONDS ?? 600),
                            silences: [],
                        }),
                        transcription: new FixtureTranscriptionProvider({}),
                    })
                  : liveLectureDependencies(db, files),
          ),
          lectureStateSchema,
          async (body, delaySeconds) => {
              await queue.send(
                  new SendMessageCommand({ QueueUrl: process.env.SQS_QUEUE_URL, MessageBody: body, DelaySeconds: delaySeconds }),
              );
          },
          (transition) => console.log(JSON.stringify(transition)),
      )
    : undefined;
if (mode === "fixture")
    console.log(
        "DEVELOPMENT FIXTURES: recording duration, speech, Spanish text, summaries and key terms are synthetic; no media decoding.",
    );
if (mode === "live") console.log("LIVE PROCESSING: real media, Soniox transcription and configured LLM; provider calls may incur charges.");
const visibilityTimeout =
    Math.max(900, ...Object.values(resourcePipeline.states).map((state) => (state.type === "task" ? state.timeoutSeconds : 0))) + 30;
const service = new ProcessingService(
    processing,
    sqsPipelineStarter(queue, process.env.SQS_QUEUE_URL!, { lecture: lecturePipeline, resource: resourcePipeline }),
);
const shutdown = new AbortController();
process.once("SIGINT", () => shutdown.abort());
process.once("SIGTERM", () => shutdown.abort());

try {
    const [command, courseId, resourceId] = process.argv.slice(2);
    if (command === "resource" && courseId && resourceId) {
        const run = await service.start({ kind: "resource", courseId, resourceId }, ["extraction"], resourcePipeline.timeoutSeconds);
        console.log(`${run.id}: ${run.status}`);
    } else if (command === "lecture" && courseId && resourceId) {
        if (!lectureRunner) throw new Error("Lecture development processing requires PROCESSING_MODE=live or PROCESSING_FIXTURES=1.");
        const run = await service.start(
            { kind: "lecture", courseId, lectureId: resourceId },
            lectureStages,
            lecturePipeline.timeoutSeconds,
        );
        console.log(`${run.id}: ${run.status}`);
    } else if (command === undefined) {
        console.log("Waiting for processing continuations…");
        while (!shutdown.signal.aborted) {
            await processing.expireRuns();
            await service.recoverStarts();
            const response = await queue.send(
                new ReceiveMessageCommand({
                    QueueUrl: process.env.SQS_QUEUE_URL,
                    MaxNumberOfMessages: 1,
                    WaitTimeSeconds: 20,
                    VisibilityTimeout: visibilityTimeout,
                }),
                { abortSignal: shutdown.signal },
            );
            for (const message of response.Messages ?? []) {
                try {
                    if (!message.Body || !message.ReceiptHandle) {
                        throw new Error("Invalid SQS continuation.");
                    }
                    const envelope: unknown = JSON.parse(message.Body);
                    const pipeline =
                        typeof envelope === "object" && envelope !== null && "pipeline" in envelope ? envelope.pipeline : undefined;
                    if (pipeline === "lecture") {
                        if (!lectureRunner) throw new Error("Lecture continuations require an explicit processing mode.");
                        await inbox.process(message.Body, visibilityTimeout, () => lectureRunner.process(message.Body!));
                    } else {
                        await inbox.process(message.Body, visibilityTimeout, () => runner.process(message.Body!));
                    }
                    await queue.send(
                        new DeleteMessageCommand({ QueueUrl: process.env.SQS_QUEUE_URL, ReceiptHandle: message.ReceiptHandle }),
                    );
                } catch (error) {
                    console.error("Continuation was not acknowledged; SQS will redeliver it.", error);
                }
            }
        }
    } else {
        throw new Error("Usage: pipeline:dev [resource <courseId> <resourceId> | lecture <courseId> <lectureId>]");
    }
} catch (error) {
    if (!shutdown.signal.aborted) {
        throw error;
    }
} finally {
    queue.destroy();
    files.destroy();
    await db.end();
}
