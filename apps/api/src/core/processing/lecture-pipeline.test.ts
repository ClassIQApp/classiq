import { migrationsDirectory, runMigrations } from "../../db/migrate.ts";
import { LlmService } from "../ai/llm-service.ts";
import { ContentIndexService } from "../content-index/content-index-service.ts";
import { PostgresContentIndexRepository } from "../content-index/postgres-content-index-repository.ts";
import { FixtureLlmFacade, type GenerationFixture } from "../lecture-content/fixture-llm-facade.ts";
import { generateContent } from "../lecture-content/generate-content.ts";
import { PostgresLectureContentRepository } from "../lecture-content/postgres-lecture-content-repository.ts";
import { planChunks } from "../recording/chunk-planner.ts";
import { FixtureRecordingNormalizer } from "../recording/fixture-normalizer.ts";
import { PostgresRecordingRepository } from "../recording/postgres-recording-repository.ts";
import { FixtureTranscriptionProvider } from "../transcript/fixture-transcription-provider.ts";
import type { TranscriptToken } from "../transcript/model.ts";
import { stitchTranscript } from "../transcript/stitch-transcript.ts";
import { PostgresUploadRepository } from "../uploads/postgres-upload-repository.ts";
import { ContinuationRunner, encodeContinuation } from "./continuation-runner.ts";
import { lectureHandlers, lecturePipeline, lectureStages, lectureStateSchema } from "./lecture-pipeline.ts";
import { PostgresProcessingRepository } from "./postgres-processing-repository.ts";
import { ProcessingService } from "./processing-service.ts";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const speech = (text: string, startSeconds: number, speaker = "1", language = "en"): TranscriptToken => ({
    kind: "speech",
    text,
    startSeconds,
    endSeconds: startSeconds + 0.4,
    speaker,
    language,
});
it("plans balanced owned spans with deterministic silence snapping and bounded overlap", () => {
    expect(planChunks(600, [])).toEqual([{ position: 0, startSeconds: 0, endSeconds: 600, audioStartSeconds: 0 }]);
    const chunks = planChunks(10_800, [
        { startSeconds: 1790, endSeconds: 1810 },
        { startSeconds: 3500, endSeconds: 3540 },
    ]);
    expect(chunks).toHaveLength(6);
    expect(chunks[1]).toMatchObject({ startSeconds: 1800, audioStartSeconds: 1795, endSeconds: 3520 });
    expect(chunks.reduce((total, chunk) => total + chunk.endSeconds - chunk.startSeconds, 0)).toBe(10_800);
    expect(() => planChunks(0, [])).toThrow();
});
it("stitches out-of-order chunks, owns boundary tokens, reconciles overlap speakers and Spanish source", () => {
    const overlap = Array.from({ length: 5 }, (_, i) => speech(`word${i} `, 5 + i * 0.5));
    const result = stitchTranscript(
        "recording",
        [
            {
                position: 1,
                startSeconds: 10,
                endSeconds: 20,
                audioStartSeconds: 5,
                tokens: [
                    ...overlap.map((_, i) => speech(`word${i} `, i * 0.5, "9")),
                    { kind: "translation", text: "overlap" },
                    speech("Hola.", 5, "9", "es"),
                ],
            },
            {
                position: 0,
                startSeconds: 0,
                endSeconds: 10,
                audioStartSeconds: 0,
                tokens: [...overlap, { kind: "translation", text: "palabras" }],
            },
        ],
        "fixture",
        "v1",
    );
    expect(result.segments).toHaveLength(2);
    expect(result.segments[1]).toMatchObject({ text: "Hola.", startSeconds: 10, speakerLabel: "S1", language: "es" });
    expect(result.segments[1]?.spanish).toBeUndefined();
    expect(result.translationStatus).toBe("succeeded");
    expect(() =>
        stitchTranscript("id", [{ position: 0, startSeconds: 0, endSeconds: 10, audioStartSeconds: 0, tokens: [] }], "fixture", "v1"),
    ).toThrow("No speech");
    const bad = stitchTranscript(
        "id",
        [
            {
                position: 0,
                startSeconds: 0,
                endSeconds: 10,
                audioStartSeconds: 0,
                tokens: [{ kind: "translation", text: "orphan" }, speech("Hello", 1)],
            },
        ],
        "fixture",
        "v1",
    );
    expect(bad.translationStatus).toBe("failed");
});

it("recovers fixture jobs after a worker restart and exposes deterministic pending/error/completion states", async () => {
    const provider = new FixtureTranscriptionProvider({
        0: { pendingChecks: 1, statusErrors: 1, lostCallback: true },
        1: { pendingChecks: 0, duplicateCompletion: true },
    });
    const input = { position: 0, audioStartSeconds: 0, endSeconds: 10 };
    const job = await provider.submit("stable", input);
    expect(await provider.submit("stable", input)).toBe(job);
    expect(provider.calls.created).toBe(1);
    await expect(provider.status(job)).rejects.toMatchObject({ name: "RetryableStageError" });
    expect(await provider.status(job)).toBe("pending");
    expect(await provider.status(job)).toBe("completed");
    expect(provider.calls.notifications).toBe(0);
    const restarted = new FixtureTranscriptionProvider({ 0: { pendingChecks: 0 } });
    expect(await restarted.status(job)).toBe("completed");
    expect(await restarted.collect(job)).toEqual(await provider.collect(job));
    expect(restarted.calls.submit).toBe(0);
    const duplicate = await provider.submit("second", { ...input, position: 1 });
    await provider.status(duplicate);
    await provider.status(duplicate);
    expect(provider.calls.notifications).toBe(2);
});

const url = process.env.TEST_UPLOAD_DATABASE_URL;
describe.skipIf(!url)("lecture checkpoints with real Postgres", () => {
    const schema = `lecture_${randomUUID().replaceAll("-", "")}`;
    const db = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    const processing = new PostgresProcessingRepository(db);
    const uploads = new PostgresUploadRepository(db);
    let courseId: string;
    beforeAll(async () => {
        await db.query(`CREATE SCHEMA ${schema}`);
        await runMigrations(db, migrationsDirectory);
        const course = await db.query("INSERT INTO courses(name,slug) VALUES ('Lecture tests','lecture-tests') RETURNING id");
        courseId = String(course.rows[0].id);
    });
    afterAll(async () => {
        await db.query(`DROP SCHEMA ${schema} CASCADE`);
        await db.end();
    });
    async function setup(
        duration = 5400,
        provider = new FixtureTranscriptionProvider({
            0: { pendingChecks: 2, lostCallback: true, submitErrors: 1 },
            1: { pendingChecks: 0, duplicateCompletion: true },
        }),
        fixtures: Partial<Record<"summary" | "key_terms", GenerationFixture>> = {},
    ) {
        const lecture = await db.query("INSERT INTO lectures(fk_course_id,title) VALUES ($1,'Fixture lecture') RETURNING id", [courseId]);
        const lectureId = String(lecture.rows[0].id);
        const recording = await uploads.initiate("recording", courseId, {
            lectureId,
            name: "fixture.wav",
            contentType: "audio/wav",
            contentLength: 10,
        });
        await uploads.complete(recording);
        const subject = { kind: "lecture", courseId, lectureId } as const;
        const { run } = await processing.begin(subject, lectureStages, lecturePipeline.timeoutSeconds);
        const normalizer = new FixtureRecordingNormalizer({ durationSeconds: duration, silences: [] });
        const repository = (runId = run.id) => new PostgresRecordingRepository(db, (client) => processing.guard(client, subject, runId));
        const llm = new FixtureLlmFacade(fixtures);
        const handlers = lectureHandlers({
            llm: new LlmService(llm),
            content: (input, context) =>
                new PostgresLectureContentRepository(db, (client) =>
                    processing.guard(client, { kind: "lecture", courseId: input.courseId, lectureId: input.lectureId }, context.runId),
                ),
            processing,
            uploads,
            storage: { verify: async () => {} },
            normalizer,
            transcription: provider,
            recording: (_, context) => repository(context.runId),
            index: (_, context) =>
                new ContentIndexService(
                    new PostgresContentIndexRepository(db, (client) => processing.guard(client, subject, context.runId)),
                ),
        });

        return { subject, run, recording, provider, normalizer, repository, handlers, llm };
    }
    async function execute(test: Awaited<ReturnType<typeof setup>>, run = test.run, reverse = false) {
        const pending = new Set<string>();
        const pipeline = reverse
            ? {
                  ...lecturePipeline,
                  states: {
                      ...lecturePipeline.states,
                      GenerateContent: {
                          ...lecturePipeline.states.GenerateContent,
                          branches: lecturePipeline.states.GenerateContent.branches.toReversed(),
                      },
                  },
              }
            : lecturePipeline;
        const runner = new ContinuationRunner(
            pipeline,
            test.handlers,
            lectureStateSchema,
            async (body) => {
                pending.add(JSON.stringify(JSON.parse(body), (key, value: unknown) => (key === "notBefore" ? undefined : value)));
            },
            () => {},
        );
        await runner.start(run.id, test.subject, run.deadline);
        let deliveries = 0;
        while (pending.size > 0) {
            const body = pending.values().next().value!;
            pending.delete(body);
            await runner.process(body);
            await runner.process(body);
            if (++deliveries > 1000) throw new Error("Unbounded lecture graph");
        }

        return deliveries;
    }
    async function transcribe(test: Awaited<ReturnType<typeof setup>>) {
        const context = { runId: test.run.id, attempt: 1, deadline: test.run.deadline };
        let input = await test.handlers.VerifyRecording!(test.subject, context);
        input = await test.handlers.NormalizeRecording!(input, context);
        for (const child of input.chunks!) {
            await test.handlers.SubmitChunk!(child, context);
            await test.handlers.CollectChunk!(child, context);
        }
        input = await test.handlers.StitchTranscript!(input, context);

        return { input, context };
    }
    it("starts a new run for previously completed Phase 3 lectures without repeating transcription", async () => {
        const test = await setup(30, new FixtureTranscriptionProvider({ 0: { pendingChecks: 0 } }));
        await transcribe(test);
        await db.query("DELETE FROM processing_stages WHERE run_id=$1 AND stage IN ('summary','key_terms')", [test.run.id]);
        await db.query("UPDATE processing_runs SET status='succeeded' WHERE id=$1", [test.run.id]);
        const retry = await processing.begin(test.subject, lectureStages, lecturePipeline.timeoutSeconds);
        expect(retry.created).toBe(true);
        expect(retry.run.number).toBe(2);
        await execute(test, retry.run);
        expect(await processing.current(test.subject)).toMatchObject({ status: "succeeded" });
        expect(test.provider.calls.created).toBe(1);
        expect(test.provider.calls.collect).toBe(1);
        expect(test.llm.calls).toEqual({ summary: 1, key_terms: 1 });
    });
    it("settles mixed generation branches in either order, preserves outputs and retries only missing work", async () => {
        let deliveries = 0;
        for (const reverse of [false, true])
            for (const failedKind of ["summary", "key_terms"] as const) {
                const fixture: GenerationFixture = { outcome: "malformed" };
                const test = await setup(600, new FixtureTranscriptionProvider({ 0: { pendingChecks: 0 } }), { [failedKind]: fixture });
                deliveries += await execute(test, test.run, reverse);
                expect(await processing.current(test.subject)).toMatchObject({ status: "failed", error_code: "GENERATION_FAILED" });
                const stages = await processing.stages(test.subject);
                expect(stages.find((stage) => stage.stage === failedKind)).toMatchObject({ status: "failed" });
                const goodKind = failedKind === "summary" ? "key_terms" : "summary";
                expect(stages.find((stage) => stage.stage === goodKind)).toMatchObject({ status: "succeeded" });
                const before = await db.query("SELECT * FROM lecture_generated_content WHERE lecture_id=$1", [test.subject.lectureId]);
                expect(before.rows).toHaveLength(1);
                expect(before.rows[0].kind).toBe(goodKind);
                expect(await test.repository().transcript(courseId, test.subject.lectureId)).toBeDefined();
                fixture.outcome = "completed";
                const service = new ProcessingService(processing, async () => {});
                const retry = await service.start(test.subject, lectureStages, lecturePipeline.timeoutSeconds);
                expect(retry.number).toBe(2);
                deliveries += await execute(test, retry, !reverse);
                expect(await processing.current(test.subject)).toMatchObject({ status: "succeeded" });
                const lecture = await db.query("SELECT status FROM lectures WHERE id=$1", [test.subject.lectureId]);
                expect(lecture.rows[0].status).toBe("ready");
                expect(test.llm.calls).toEqual({ [goodKind]: 1, [failedKind]: 2 }); // Permanent failures settle before duplicate delivery.
                expect(test.provider.calls.created).toBe(1);
                expect(test.provider.calls.collect).toBe(1);
                expect(test.normalizer.calls.get(test.recording.id)).toBe(1);
                const after = await db.query("SELECT * FROM lecture_generated_content WHERE lecture_id=$1", [test.subject.lectureId]);
                expect(after.rows).toHaveLength(2);
                expect(after.rows.find((row) => row.kind === goodKind)).toEqual(before.rows[0]);
                const history = await db.query("SELECT status FROM processing_stages WHERE run_id=$1 AND stage=$2", [
                    test.run.id,
                    failedKind,
                ]);
                expect(history.rows[0].status).toBe("failed");
            }
        console.log(JSON.stringify({ generationRecovery: { lectures: 4, runs: 8, deliveries } }));
    });
    it("does not reopen a failed generation branch while its sibling is still running", async () => {
        const test = await setup(30, new FixtureTranscriptionProvider({ 0: { pendingChecks: 0 } }), { summary: { outcome: "malformed" } });
        const { input, context } = await transcribe(test);
        await expect(test.handlers.GenerateSummary!(input, context)).rejects.toBeDefined();
        await test.handlers.SummaryFailure!(input, context);
        const stages = await processing.stages(test.subject);
        const failed = stages.find((stage) => stage.stage === "summary");
        expect(await processing.current(test.subject)).toMatchObject({ status: "running" });
        await test.handlers.GenerateSummary!(input, context);
        expect(test.llm.calls.summary).toBe(1);
        const after = await processing.stages(test.subject);
        expect(after.find((stage) => stage.stage === "summary")).toEqual(failed);
        await test.handlers.GenerateKeyTerms!(input, context);
        const publication = await test.handlers.PublishLecture!(input, context);
        expect(publication.publicationStatus).toBe("failed");
    });

    it("keeps concurrent duplicate generation writes idempotent and reuses their completed output", async () => {
        const test = await setup(30, new FixtureTranscriptionProvider({ 0: { pendingChecks: 0 } }), { summary: { delayMs: 40 } });
        const { input, context } = await transcribe(test);
        const attempts = await Promise.allSettled([
            test.handlers.GenerateSummary!(input, context),
            test.handlers.GenerateSummary!(input, context),
        ]);
        expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
        expect(test.llm.calls.summary).toBe(1);
        await test.handlers.GenerateSummary!(input, context);
        expect(test.llm.calls.summary).toBe(1);
        const rows = await db.query("SELECT count(*)::int AS count FROM lecture_generated_content WHERE lecture_id=$1", [input.lectureId]);
        expect(rows.rows[0].count).toBe(1);
        await processing.stageFailed(test.subject, test.run.id, "summary", "LATE", "Late duplicate failure.");
        const stages = await processing.stages(test.subject);
        expect(stages.find((stage) => stage.stage === "summary")).toMatchObject({ status: "succeeded" });
    });
    it("repeats a provider response lost before commit and then reuses the saved output", async () => {
        const test = await setup(30, new FixtureTranscriptionProvider({ 0: { pendingChecks: 0 } }));
        const { input, context } = await transcribe(test);
        const transcript = (await test.repository().transcript(courseId, input.lectureId))!;
        const repository = new PostgresLectureContentRepository(db, (client) => processing.guard(client, test.subject, context.runId));
        await expect(
            generateContent(
                input,
                "summary",
                transcript,
                {
                    read: (...args) => repository.read(...args),
                    save: async () => {
                        throw new Error("Process interrupted after provider response");
                    },
                },
                new LlmService(test.llm),
                context.deadline,
            ),
        ).rejects.toThrow("Process interrupted");
        expect(await repository.read(input, "summary")).toBeUndefined();
        await test.handlers.GenerateSummary!(input, context);
        await test.handlers.GenerateSummary!(input, context);
        expect(test.llm.calls.summary).toBe(2);
        expect(await repository.read(input, "summary")).toBeDefined();
    });

    it("validates malformed/refused output, bounds transient retries and keeps messages safe", async () => {
        for (const outcome of ["refused", "transient", "malformed"] as const) {
            const test = await setup(30, new FixtureTranscriptionProvider({ 0: { pendingChecks: 0 } }), { summary: { outcome } });
            await execute(test);
            expect(await processing.current(test.subject)).toMatchObject({ status: "failed" });
            const stages = await processing.stages(test.subject);
            const stage = stages.find((stage) => stage.stage === "summary")!;
            expect(stage.status_message).toBe("Summary generation failed. Retry processing.");
            expect(test.llm.calls.summary).toBe(outcome === "transient" ? 10 : 1);
            expect(test.llm.calls.key_terms).toBe(1);
        }
    });
    it("drops invalid time ranges and rejects output without usable transcript citations", async () => {
        const valid = { startSeconds: 6, endSeconds: 7 };
        const invalid = [
            { startSeconds: 29, endSeconds: 35 },
            { startSeconds: 10, endSeconds: 9 },
            { startSeconds: 20, endSeconds: 21 },
        ];
        for (const sources of [[...invalid, valid], invalid]) {
            const test = await setup(30, new FixtureTranscriptionProvider({ 0: { pendingChecks: 0 } }), {
                key_terms: { text: JSON.stringify({ terms: [{ term: "Gradient", explanation: "A direction of change.", sources }] }) },
            });
            await execute(test);
            expect(await processing.current(test.subject)).toMatchObject({ status: sources.includes(valid) ? "succeeded" : "failed" });
            if (sources.includes(valid)) {
                const stored = await new PostgresLectureContentRepository(db, async () => {}).read(test.subject, "key_terms");
                expect(stored?.content).toEqual({ terms: [{ term: "Gradient", explanation: "A direction of change.", sources: [valid] }] });
            }
        }
    });
    it("fences transcript changes, stale writes and readiness snapshots without repeating completed generation", async () => {
        const test = await setup(30, new FixtureTranscriptionProvider({ 0: { pendingChecks: 0 } }));
        const { input, context } = await transcribe(test);
        await expect(test.handlers.PublishLecture!(input, context)).rejects.toMatchObject({ code: "CONTENT_PENDING" });
        await expect(test.handlers.GenerateSummary!({ ...input, transcriptHash: "wrong" }, context)).rejects.toMatchObject({
            code: "TRANSCRIPT_CHANGED",
        });
        expect(test.llm.calls.summary).toBe(0);
        await Promise.all([test.handlers.GenerateSummary!(input, context), test.handlers.GenerateKeyTerms!(input, context)]);
        const content = new PostgresLectureContentRepository(db, (client) => processing.guard(client, test.subject, test.run.id));
        const output = (await content.read(test.subject, "summary"))!;
        const before = await db.query("SELECT updated_at FROM lecture_generated_content WHERE lecture_id=$1 AND kind='summary'", [
            input.lectureId,
        ]);
        await Promise.all(Array.from({ length: 12 }, () => content.save(test.subject, output)));
        const after = await db.query("SELECT updated_at FROM lecture_generated_content WHERE lecture_id=$1 AND kind='summary'", [
            input.lectureId,
        ]);
        expect(after.rows).toEqual(before.rows);
        const transcript = (await test.repository().transcript(courseId, input.lectureId))!;
        await test
            .repository()
            .saveTranscript({ ...test.subject, recordingId: test.recording.id }, { ...transcript, contentHash: "changed-version" });
        await expect(content.save(test.subject, output)).rejects.toMatchObject({ code: "TRANSCRIPT_CHANGED" });
        await expect(test.handlers.PublishLecture!(input, context)).rejects.toMatchObject({ code: "TRANSCRIPT_CHANGED" });
        await processing.fail(test.subject, test.run.id, "TEST", "Retry processing.");
        const retry = await processing.begin(test.subject, lectureStages, lecturePipeline.timeoutSeconds);
        await expect(content.save(test.subject, output)).rejects.toMatchObject({ name: "SupersededRunError" });
        await expect(processing.stageFailed(test.subject, test.run.id, "summary", "STALE", "stale")).rejects.toMatchObject({
            name: "SupersededRunError",
        });
        expect(await processing.current(test.subject)).toMatchObject({ id: retry.run.id, status: "running" });
        expect(test.llm.calls).toEqual({ summary: 1, key_terms: 1 });
    });
    it("rejects in-flight output after transcript change, run supersession or persisted deadline expiry", async () => {
        for (const interrupt of ["version", "supersede", "deadline"] as const) {
            const test = await setup(30, new FixtureTranscriptionProvider({ 0: { pendingChecks: 0 } }), { summary: { delayMs: 80 } });
            const { input, context } = await transcribe(test);
            const generating = test.handlers.GenerateSummary!(input, context).catch((error: unknown) => error);
            await vi.waitFor(() => expect(test.llm.calls.summary).toBe(1), { interval: 1 });
            if (interrupt === "version") {
                const transcript = (await test.repository().transcript(courseId, input.lectureId))!;
                await test
                    .repository()
                    .saveTranscript({ ...test.subject, recordingId: test.recording.id }, { ...transcript, contentHash: "next" });
            } else if (interrupt === "supersede") {
                await processing.fail(test.subject, test.run.id, "TEST", "Try again.");
                await processing.begin(test.subject, lectureStages, lecturePipeline.timeoutSeconds);
            } else {
                await db.query("UPDATE processing_runs SET deadline=now()-interval '1 second' WHERE id=$1", [test.run.id]);
            }
            expect(await generating).toMatchObject(
                interrupt === "version" ? { code: "TRANSCRIPT_CHANGED" } : { name: "SupersededRunError" },
            );
            expect(await new PostgresLectureContentRepository(db, async () => {}).read(test.subject, "summary")).toBeUndefined();
            if (interrupt === "deadline")
                expect(await processing.current(test.subject)).toMatchObject({ status: "failed", error_code: "PROCESSING_TIMEOUT" });
        }
        const test = await setup(30, new FixtureTranscriptionProvider({ 0: { pendingChecks: 0 } }), { summary: { delayMs: 100 } });
        const { input, context } = await transcribe(test);
        await expect(test.handlers.GenerateSummary!(input, { ...context, deadline: new Date(Date.now() + 5) })).rejects.toMatchObject({
            code: "GENERATION_UNAVAILABLE",
        });
        expect(await new PostgresLectureContentRepository(db, async () => {}).read(test.subject, "summary")).toBeUndefined();
    });
    it("executes polling graph under duplicate continuations, indexes once and reuses all provider work on retry", async () => {
        const test = await setup();
        const queue: string[] = [];
        const runner = new ContinuationRunner(
            lecturePipeline,
            test.handlers,
            lectureStateSchema,
            async (body) => {
                const ready = JSON.stringify(JSON.parse(body), (key, value: unknown) => (key === "notBefore" ? undefined : value));
                if (!queue.includes(ready)) queue.push(ready);
            },
            () => {},
        );
        queue.push(
            encodeContinuation({
                pipeline: "lecture",
                runId: test.run.id,
                state: lecturePipeline.startAt,
                input: test.subject,
                attempt: 1,
                deadline: test.run.deadline.getTime(),
            }),
        );
        let deliveries = 0;
        while (queue.length > 0) {
            const body = queue.shift()!;
            await runner.process(body);
            await runner.process(body);
            if (++deliveries > 1000) throw new Error("Unbounded graph");
        }
        expect(await processing.current(test.subject)).toMatchObject({ status: "succeeded" });
        expect(test.provider.calls.created).toBe(3);
        expect(test.provider.calls.collect).toBe(3);
        const transcript = await test.repository().transcript(courseId, test.subject.lectureId);
        expect(transcript?.segments).toHaveLength(3);
        expect(transcript?.provider).toBe("development-fixture");
        const count = await db.query("SELECT count(*)::int AS count FROM content_sources WHERE lecture_id=$1", [test.subject.lectureId]);
        expect(count.rows[0].count).toBe(1);
        await db.query("UPDATE processing_runs SET status='failed' WHERE id=$1", [test.run.id]);
        const { run: retry } = await processing.begin(test.subject, lectureStages, lecturePipeline.timeoutSeconds);
        const context = { runId: retry.id, attempt: 1, deadline: retry.deadline };
        let input = await test.handlers.VerifyRecording!(test.subject, context);
        input = await test.handlers.NormalizeRecording!(input, context);
        for (const child of input.chunks!.toReversed()) {
            await test.handlers.SubmitChunk!(child, context);
            await test.handlers.CollectChunk!(child, context);
        }
        await test.handlers.StitchTranscript!(input, context);
        expect(test.provider.calls.created).toBe(3);
        expect(test.provider.calls.collect).toBe(3);
        expect(test.normalizer.calls.get(test.recording.id)).toBe(1);
        await expect(
            test.repository(test.run.id).saveTranscript({ ...test.subject, recordingId: test.recording.id }, transcript!),
        ).rejects.toMatchObject({ name: "SupersededRunError" });
        await expect(
            test.repository(test.run.id).collect({ ...test.subject, recordingId: test.recording.id }, 0, []),
        ).rejects.toMatchObject({ name: "SupersededRunError" });
        console.log(JSON.stringify({ deliveries, provider: test.provider.calls }));
    });
    it("persists empty speech and permanent provider failures, while alignment failure preserves transcript", async () => {
        for (const [fixture, code] of [
            [{ tokens: [] as TranscriptToken[] }, "NO_SPEECH"],
            [{ outcome: "permanent_error" as const }, "TRANSCRIPTION_FAILED"],
        ] as const) {
            const test = await setup(30, new FixtureTranscriptionProvider({ 0: fixture }));
            const queue: string[] = [];
            const runner = new ContinuationRunner(
                lecturePipeline,
                test.handlers,
                lectureStateSchema,
                async (body) => {
                    const ready = JSON.stringify(JSON.parse(body), (key, value: unknown) => (key === "notBefore" ? undefined : value));
                    if (!queue.includes(ready)) queue.push(ready);
                },
                () => {},
            );
            queue.push(
                encodeContinuation({
                    pipeline: "lecture",
                    runId: test.run.id,
                    state: lecturePipeline.startAt,
                    input: test.subject,
                    attempt: 1,
                    deadline: test.run.deadline.getTime(),
                }),
            );
            while (queue.length > 0) await runner.process(queue.shift()!);
            expect(await processing.current(test.subject)).toMatchObject({ status: "failed", error_code: code });
        }
        const transient = await setup(30, new FixtureTranscriptionProvider({ 0: { pendingChecks: 0, outcome: "transient_error" } }));
        const pending: string[] = [];
        const failedRunner = new ContinuationRunner(
            lecturePipeline,
            transient.handlers,
            lectureStateSchema,
            async (body) => {
                pending.push(JSON.stringify(JSON.parse(body), (key, value: unknown) => (key === "notBefore" ? undefined : value)));
            },
            () => {},
        );
        await failedRunner.start(transient.run.id, transient.subject, transient.run.deadline);
        let attempts = 0;
        while (pending.length > 0) {
            await failedRunner.process(pending.shift()!);
            if (++attempts > 100) throw new Error("Retry budget was not bounded");
        }
        expect(await processing.current(transient.subject)).toMatchObject({
            status: "failed",
            error_code: "TRANSCRIPTION_RETRIES_EXHAUSTED",
        });
        expect(transient.provider.calls.created).toBe(3);
        const { run: recovered } = await processing.begin(transient.subject, lectureStages, lecturePipeline.timeoutSeconds);
        const recoveredContext = { runId: recovered.id, attempt: 1, deadline: recovered.deadline };
        let recoveredInput = await transient.handlers.VerifyRecording!(transient.subject, recoveredContext);
        recoveredInput = await transient.handlers.NormalizeRecording!(recoveredInput, recoveredContext);
        await transient.handlers.SubmitChunk!(recoveredInput.chunks![0]!, recoveredContext);
        expect(transient.provider.calls.created).toBe(4);
        const test = await setup(30, new FixtureTranscriptionProvider({ 0: { tokens: [speech("Hello.", 1)] } }));
        const context = { runId: test.run.id, attempt: 1, deadline: test.run.deadline };
        let input = await test.handlers.VerifyRecording!(test.subject, context);
        input = await test.handlers.NormalizeRecording!(input, context);
        const child = input.chunks![0]!;
        await test.handlers.SubmitChunk!(child, context);
        await test.handlers.CollectChunk!(child, context);
        input = await test.handlers.StitchTranscript!(input, context);
        await test.handlers.GenerateSummary!(input, context);
        await test.handlers.GenerateKeyTerms!(input, context);
        const resource = await uploads.initiate("resource", courseId, {
            lectureId: test.subject.lectureId,
            name: "support.pdf",
            contentType: "application/pdf",
            contentLength: 10,
        });
        await uploads.complete(resource);
        const resourceSubject = { kind: "resource", courseId, resourceId: resource.resourceId! } as const;
        const resourceRun = await processing.begin(resourceSubject, ["extraction"], 600);
        await processing.fail(resourceSubject, resourceRun.run.id, "PDF_FAILED", "The PDF could not be read.");
        await test.handlers.PublishLecture!(input, context);
        const lectureStatus = await db.query("SELECT status FROM lectures WHERE id=$1", [input.lectureId]);
        expect(lectureStatus.rows[0].status).toBe("ready");
        expect(await processing.current(test.subject)).toMatchObject({ status: "succeeded" });
        const stages = await processing.stages(test.subject);
        expect(stages.find((stage) => stage.stage === "translation")).toMatchObject({
            status: "failed",
            error_code: "SPANISH_ALIGNMENT_FAILED",
        });
        expect(await test.repository().transcript(courseId, test.subject.lectureId)).toBeDefined();
    });
});
