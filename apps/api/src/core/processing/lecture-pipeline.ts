import type { LlmService } from "../ai/llm-service.ts";
import type { ContentIndexService } from "../content-index/content-index-service.ts";
import { generateContent } from "../lecture-content/generate-content.ts";
import type { ContentKind, LectureContentRepository } from "../lecture-content/model.ts";
import { planChunks } from "../recording/chunk-planner.ts";
import type { RecordingNormalizer, RecordingReference, RecordingRepository } from "../recording/model.ts";
import type { TranscriptionProvider } from "../transcript/model.ts";
import { stitchTranscript } from "../transcript/stitch-transcript.ts";
import { UploadError, type UploadRepository, type UploadStorage } from "../uploads/model.ts";
import { definePipeline, PermanentStageError, RetryableStageError, transient, type StageContext, type StageHandler } from "./pipeline.ts";
import type { PostgresProcessingRepository } from "./postgres-processing-repository.ts";
import { z } from "zod";

const childSchema = z.object({
    courseId: z.string(),
    lectureId: z.string(),
    recordingId: z.string(),
    position: z.number().int().nonnegative(),
    chunkStatus: z.enum(["pending", "completed", "resubmit"]).optional(),
});
const lectureInputSchema = z.object({
    courseId: z.string(),
    lectureId: z.string(),
    recordingId: z.string().optional(),
    position: z.number().int().nonnegative().optional(),
    chunkStatus: z.enum(["pending", "completed", "resubmit"]).optional(),
    chunks: z.array(childSchema).optional(),
    chunkResults: z.object({ values: z.array(childSchema) }).optional(),
    transcriptHash: z.string().optional(),
    publicationStatus: z.enum(["ready", "failed"]).optional(),
});
export const lectureStateSchema = lectureInputSchema.extend({
    contentResults: z.object({ values: z.array(lectureInputSchema) }).optional(),
});
export type LectureState = z.infer<typeof lectureStateSchema>;
const task = (next: string, timeoutSeconds = 60) =>
    ({ type: "task", next, timeoutSeconds, retry: transient, catches: { SupersededRunError: "Done" } }) as const;
const chunkPipeline = definePipeline({
    name: "chunk",
    startAt: "SubmitChunk",
    states: {
        SubmitChunk: task("WaitForChunk", 180),
        WaitForChunk: { type: "wait", seconds: 2, next: "CheckChunk" },
        CheckChunk: task("ChunkStatus"),
        ChunkStatus: {
            type: "choice",
            field: "chunkStatus",
            cases: { completed: "CollectChunk", resubmit: "SubmitChunk" },
            default: "WaitForChunk",
        },
        CollectChunk: task("Done", 180),
        Done: { type: "succeed" },
    },
});
const summaryPipeline = definePipeline({
    name: "summary",
    startAt: "GenerateSummary",
    catch: "SummaryFailure",
    states: { GenerateSummary: task("Done", 180), SummaryFailure: task("Done"), Done: { type: "succeed" } },
});
const keyTermsPipeline = definePipeline({
    name: "key-terms",
    startAt: "GenerateKeyTerms",
    catch: "KeyTermsFailure",
    states: { GenerateKeyTerms: task("Done", 180), KeyTermsFailure: task("Done"), Done: { type: "succeed" } },
});
export const lectureStages = ["verification", "normalization", "transcription", "translation", "summary", "key_terms"] as const;
export const lecturePipeline = definePipeline({
    name: "lecture",
    startAt: "VerifyRecording",
    timeoutSeconds: 14_400,
    catch: "RecordFailure",
    states: {
        VerifyRecording: task("NormalizeRecording"),
        NormalizeRecording: task("TranscribeChunks", 900),
        TranscribeChunks: {
            type: "map",
            itemsField: "chunks",
            iterator: chunkPipeline,
            resultField: "chunkResults",
            maxConcurrency: 10,
            next: "StitchTranscript",
        },
        StitchTranscript: task("GenerateContent"),
        GenerateContent: {
            type: "parallel",
            branches: [summaryPipeline, keyTermsPipeline],
            resultField: "contentResults",
            next: "PublishLecture",
        },
        PublishLecture: task("PublicationStatus"),
        PublicationStatus: { type: "choice", field: "publicationStatus", cases: { ready: "Done" }, default: "Failed" },
        RecordFailure: task("Failed"),
        Failed: { type: "fail" },
        Done: { type: "succeed" },
    },
});
export interface LectureDependencies {
    processing: PostgresProcessingRepository;
    llm: LlmService;
    content: (input: LectureState, context: StageContext) => LectureContentRepository;
    uploads: Pick<UploadRepository, "find">;
    storage: Pick<UploadStorage, "verify">;
    normalizer: RecordingNormalizer;
    transcription: TranscriptionProvider;
    recording: (input: LectureState, context: StageContext) => RecordingRepository;
    index: (input: LectureState, context: StageContext) => Pick<ContentIndexService, "indexSource">;
}
export function lectureHandlers(deps: LectureDependencies): Record<string, StageHandler<LectureState>> {
    const subject = (input: LectureState) => ({ kind: "lecture", courseId: input.courseId, lectureId: input.lectureId }) as const;
    const reference = (input: LectureState): RecordingReference => {
        if (!input.recordingId) throw new Error("Missing recording identity.");

        return { ...input, recordingId: input.recordingId };
    };
    const asset = async (input: LectureState) => {
        const recording = await deps.uploads.find(input.courseId, "recording", input.lectureId);
        if (!recording || recording.uploadStatus !== "uploaded" || (input.recordingId && input.recordingId !== recording.id))
            throw new PermanentStageError("RECORDING_NOT_UPLOADED", "Upload the recording before processing it.");

        return recording;
    };
    const chunk = async (input: LectureState, context: StageContext) => {
        const chunks = await deps.recording(input, context).chunks(reference(input));
        const found = chunks.find((chunk) => chunk.position === input.position);
        if (!found) throw new Error("Recording chunk is missing.");

        return found;
    };

    const generate =
        (kind: ContentKind): StageHandler<LectureState> =>
        async (input, context) => {
            const started = await deps.processing.stage(subject(input), context.runId, kind, "running", context.attempt);
            if (!started) return input;
            const transcript = await deps.recording(input, context).transcript(input.courseId, input.lectureId);
            if (!transcript || transcript.contentHash !== input.transcriptHash)
                throw new PermanentStageError("TRANSCRIPT_CHANGED", "The transcript changed. Retry processing.");
            try {
                await deps.processing.invoke(subject(input), context.runId, `${kind}:${transcript.contentHash}`, context.deadline, () =>
                    generateContent(input, kind, transcript, deps.content(input, context), deps.llm, context.deadline),
                );
            } catch (error) {
                if (error instanceof PermanentStageError)
                    await deps.processing.stageFailed(subject(input), context.runId, kind, error.code, error.message);
                throw error;
            }
            await deps.processing.stage(subject(input), context.runId, kind, "succeeded", context.attempt);

            return input;
        };
    const branchFailure =
        (kind: ContentKind): StageHandler<LectureState> =>
        async (input, context) => {
            await deps.processing.stageFailed(
                subject(input),
                context.runId,
                kind,
                context.failure?.code ?? "GENERATION_FAILED",
                kind === "summary" ? "Summary generation failed. Retry processing." : "Key-term generation failed. Retry processing.",
            );

            return input;
        };

    return {
        GenerateSummary: generate("summary"),
        GenerateKeyTerms: generate("key_terms"),
        SummaryFailure: branchFailure("summary"),
        KeyTermsFailure: branchFailure("key_terms"),
        VerifyRecording: async (input, context) => {
            await deps.processing.stage(subject(input), context.runId, "verification", "running", context.attempt);
            const recording = await asset(input);
            try {
                await deps.storage.verify(recording);
            } catch (error) {
                if (error instanceof UploadError) {
                    if (error.status === 503) throw new RetryableStageError(error.code, error.message);
                    throw new PermanentStageError(error.code, error.message);
                }
                throw error;
            }
            await deps.processing.stage(subject(input), context.runId, "verification", "succeeded", context.attempt);

            return { ...input, recordingId: recording.id };
        },
        NormalizeRecording: async (input, context) => {
            await deps.processing.stage(subject(input), context.runId, "normalization", "running", context.attempt);
            const repository = deps.recording(input, context);
            let chunks = await repository.chunks(reference(input));
            if (chunks.length === 0) {
                const normalized = await deps.normalizer.normalize(await asset(input), context.deadline);
                await repository.savePlan(
                    reference(input),
                    normalized.preparedChunks ?? planChunks(normalized.durationSeconds, normalized.silences),
                    !!normalized.preparedChunks,
                );
                chunks = await repository.chunks(reference(input));
            }
            if (deps.normalizer.preparesAudio && chunks.some((chunk) => !chunk.mediaPrepared))
                throw new PermanentStageError(
                    "FIXTURE_CHECKPOINT",
                    "This lecture contains synthetic checkpoints. Upload a new lecture for real processing.",
                );
            await deps.processing.stage(subject(input), context.runId, "normalization", "succeeded", context.attempt);
            await deps.processing.stage(subject(input), context.runId, "transcription", "running", context.attempt);

            return { ...input, chunks: chunks.map((chunk) => ({ ...reference(input), position: chunk.position })) };
        },
        SubmitChunk: async (input, context) => {
            await deps.processing.stage(subject(input), context.runId, "transcription", "running", context.attempt);
            const current = await chunk(input, context);
            if (current.tokens || current.jobId) return input;
            if (current.submissionRunId === context.runId && current.runSubmissions >= 3)
                throw new PermanentStageError("TRANSCRIPTION_RETRIES_EXHAUSTED", "Transcription could not complete. Try again.");
            await deps.processing.invoke(
                subject(input),
                context.runId,
                `submit:${input.recordingId}:${current.position}`,
                context.deadline,
                async () => {
                    const latest = await chunk(input, context);
                    if (latest.tokens || latest.jobId) return;
                    const jobId = await deps.transcription.submit(
                        `${input.recordingId}:${latest.position}:${latest.submissions + 1}`,
                        { ...latest, recording: reference(input) },
                        context.deadline,
                    );
                    await deps.recording(input, context).submit(reference(input), latest.position, jobId, context.runId);
                },
            );

            return input;
        },
        CheckChunk: async (input, context) => {
            const current = await chunk(input, context);
            if (current.tokens) return { ...input, chunkStatus: "completed" };
            if (!current.jobId) return { ...input, chunkStatus: "resubmit" };
            const status = await deps.transcription.status(current.jobId, context.deadline);
            if (status === "permanent_error") {
                await deps.transcription.release?.(current.jobId, context.deadline);
                await deps.recording(input, context).resetJob(reference(input), current.position, current.jobId);
                throw new PermanentStageError(
                    "TRANSCRIPTION_FAILED",
                    "The recording could not be transcribed. Check the recording and try again.",
                );
            }
            if (status === "transient_error") {
                await deps.transcription.release?.(current.jobId, context.deadline);
                await deps.recording(input, context).resetJob(reference(input), current.position, current.jobId);

                return { ...input, chunkStatus: "resubmit" };
            }

            return { ...input, chunkStatus: status };
        },
        CollectChunk: async (input, context) => {
            const current = await chunk(input, context);
            if (!current.tokens) {
                if (!current.jobId) throw new RetryableStageError("JOB_NOT_READY", "Transcription is not ready.");
                await deps
                    .recording(input, context)
                    .collect(reference(input), current.position, await deps.transcription.collect(current.jobId, context.deadline));
            }

            if (current.jobId) await deps.transcription.release?.(current.jobId, context.deadline);

            return input;
        },
        StitchTranscript: async (input, context) => {
            const repository = deps.recording(input, context);
            const chunks = await repository.chunks(reference(input));
            const collected = chunks.map((chunk) => {
                if (!chunk.tokens) throw new RetryableStageError("CHUNKS_PENDING", "Transcription is not ready.");

                return { ...chunk, tokens: chunk.tokens };
            });
            const transcript = stitchTranscript(
                reference(input).recordingId,
                collected,
                deps.transcription.provider,
                deps.transcription.model,
            );
            await repository.saveTranscript(reference(input), transcript);
            await deps.index(input, context).indexSource(
                { kind: "transcript", courseId: input.courseId, lectureId: input.lectureId },
                transcript.segments.map(({ text, startSeconds, endSeconds }) => ({ text, startSeconds, endSeconds })),
            );
            await deps.processing.stage(subject(input), context.runId, "transcription", "succeeded", context.attempt);
            await deps.processing.translation(subject(input), context.runId, transcript.translationStatus, context.attempt);

            return { ...input, transcriptHash: transcript.contentHash };
        },
        PublishLecture: async (input, context) => {
            const ready = await deps.processing.publishLecture(subject(input), context.runId, input.transcriptHash ?? "");

            return { ...input, publicationStatus: ready ? "ready" : "failed" };
        },
        RecordFailure: async (input, context) => {
            await deps.processing.fail(
                subject(input),
                context.runId,
                context.failure?.code ?? "PROCESSING_FAILED",
                context.failure?.message ?? "Processing failed. Try again.",
            );

            return input;
        },
    };
}
