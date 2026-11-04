import { LlmService } from "../src/core/ai/llm-service.ts";
import { FixtureLlmFacade } from "../src/core/lecture-content/fixture-llm-facade.ts";
import { generateAsl } from "../src/core/processing/asl.ts";
import { lecturePipeline } from "../src/core/processing/lecture-pipeline.ts";
import { PostgresProcessingRepository } from "../src/core/processing/postgres-processing-repository.ts";
import { resourcePipeline } from "../src/core/processing/resource-pipeline.ts";
import { FixtureRecordingNormalizer } from "../src/core/recording/fixture-normalizer.ts";
import { FixtureTranscriptionProvider } from "../src/core/transcript/fixture-transcription-provider.ts";
import type * as StageArtifact from "../src/stages.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";

const directory = await mkdtemp(path.join(tmpdir(), "classiq-artifact-"));
try {
    execFileSync("unzip", ["-q", path.resolve("dist/lambda.zip"), "-d", directory]);
    const emitted = await Promise.all(
        ["index.mjs", "index.mjs.map", "stages.mjs", "stages.mjs.map"].map((file) => readFile(path.join(directory, file), "utf8")),
    );
    for (const name of ["DATABASE_URL", "SONIOX_API_KEY", "DEEPSEEK_API_KEY", "BETTER_AUTH_SECRET"]) {
        const value = process.env[name];
        if (value)
            assert.ok(
                emitted.every((file) => !file.includes(value)),
                `${name} leaked into a generated artifact.`,
            );
    }
    const stages: typeof StageArtifact = await import(pathToFileURL(path.join(directory, "stages.mjs")).href);
    let invocations = 0;
    const handlers = stages.resourceStageHandlers(
        {
            stage: async () => {
                invocations++;

                return true;
            },
            succeed: async () => {
                invocations++;
            },
            fail: async () => {
                invocations++;
            },
        },
        async (input) => input,
    );
    const event = { envelope: { runId: "artifact-test", input: { courseId: "1", resourceId: "2" } }, retryCount: 0, timeoutSeconds: 30 };
    for (const name of ["ExtractResource", "CompleteResource", "RecordFailure"]) {
        assert.deepEqual(await handlers[name]!(event, { getRemainingTimeInMillis: () => 30_000 }), event.envelope);
    }
    assert.equal(invocations, 4);
    const unexpected = () => {
        throw new Error("Unexpected fixture dependency invocation.");
    };
    let lectureStages = 0;
    let verified = 0;
    const lecture = stages.lectureStageHandlers({
        processing: new (class extends PostgresProcessingRepository {
            override async stage() {
                lectureStages++;

                return true;
            }
        })(new Pool({ connectionString: "postgres://unused.invalid/artifact" })),
        llm: new LlmService(new FixtureLlmFacade()),
        uploads: {
            find: async () => ({
                id: "recording-1",
                uploadId: "upload-1",
                kind: "recording",
                courseId: "1",
                lectureId: "2",
                name: "fixture.m4a",
                contentType: "audio/mp4",
                contentLength: 1,
                uploadStatus: "uploaded",
            }),
        },
        storage: {
            verify: async () => {
                verified++;
            },
        },
        normalizer: new FixtureRecordingNormalizer({ durationSeconds: 2, silences: [] }),
        transcription: new FixtureTranscriptionProvider({}),
        recording: unexpected,
        content: unexpected,
        index: unexpected,
    });
    const lectureEvent = {
        envelope: { runId: "artifact-lecture", input: { courseId: "1", lectureId: "2" } },
        retryCount: 0,
        timeoutSeconds: 60,
    };
    assert.deepEqual(await lecture.VerifyRecording!(lectureEvent, { getRemainingTimeInMillis: () => 60_000 }), {
        ...lectureEvent.envelope,
        input: { ...lectureEvent.envelope.input, recordingId: "recording-1" },
    });
    assert.equal(lectureStages, 2);
    assert.equal(verified, 1);
    const unconfigured = `import { lectureNormalizeRecording } from ${JSON.stringify(pathToFileURL(path.join(directory, "stages.mjs")).href)};
        try { await lectureNormalizeRecording(${JSON.stringify({ envelope: { runId: "unconfigured", input: { courseId: "1", lectureId: "2" } }, retryCount: 0, timeoutSeconds: 900 })}, {getRemainingTimeInMillis: () => 900000}); process.exit(1); }
        catch (error) { if (!/DATABASE_URL is required/.test(error.message)) throw error; }`;
    execFileSync(process.execPath, ["--input-type=module", "-e", unconfigured], { env: { NODE_ENV: "production" }, timeout: 10_000 });
    for (const pipeline of [lecturePipeline, resourcePipeline]) {
        const asl = JSON.parse(await readFile(`dist/pipelines/${pipeline.name}.asl.json`, "utf8"));
        assert.deepEqual(asl, generateAsl(pipeline));
        const tasks: Record<string, { handler: string; timeoutSeconds: number }> = JSON.parse(
            await readFile(`dist/pipelines/${pipeline.name}.tasks.json`, "utf8"),
        );
        for (const task of Object.values(tasks)) {
            assert.equal(typeof stages[task.handler.slice("stages.".length) as keyof typeof stages], "function");
        }
    }
    console.log(
        "Extracted ZIP: lecture verification and resource projection/extraction adapters executed, fail-closed live boundary verified; both ASL files match shared definitions and all 15 exports resolve.",
    );
} finally {
    await rm(directory, { recursive: true, force: true });
}
