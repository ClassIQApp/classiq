import type { Transcript, TranscriptToken } from "../transcript/model.ts";
import type { UploadAsset } from "../uploads/model.ts";
import type { ChunkPlan, TimeSpan } from "./chunk-planner.ts";

export interface NormalizedRecording {
    durationSeconds: number;
    silences: TimeSpan[];
    preparedChunks?: ChunkPlan[];
}
export interface RecordingNormalizer {
    readonly preparesAudio?: boolean;
    normalize(asset: UploadAsset, deadline?: Date): Promise<NormalizedRecording>;
}
export interface RecordingReference {
    courseId: string;
    lectureId: string;
    recordingId: string;
}
export interface RecordingChunk extends ChunkPlan {
    mediaPrepared?: boolean;
    jobId?: string;
    submissions: number;
    submissionRunId?: string;
    runSubmissions: number;
    tokens?: TranscriptToken[];
}
export interface RecordingRepository {
    chunks(reference: RecordingReference): Promise<RecordingChunk[]>;
    savePlan(reference: RecordingReference, chunks: readonly ChunkPlan[], mediaPrepared?: boolean): Promise<void>;
    submit(reference: RecordingReference, position: number, jobId: string, runId: string): Promise<void>;
    resetJob(reference: RecordingReference, position: number, jobId: string): Promise<void>;
    collect(reference: RecordingReference, position: number, tokens: TranscriptToken[]): Promise<void>;
    transcript(courseId: string, lectureId: string): Promise<Transcript | undefined>;
    saveTranscript(reference: RecordingReference, transcript: Transcript): Promise<void>;
}
