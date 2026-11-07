import type { ChunkPlan } from "./chunk-planner.ts";
import type { RecordingReference } from "./model.ts";

export interface RecordingAudioStorage {
    upload(reference: RecordingReference, chunk: ChunkPlan, file: string, deadline?: Date): Promise<void>;
    download(reference: RecordingReference, position: number, file: string, deadline?: Date): Promise<void>;
}
