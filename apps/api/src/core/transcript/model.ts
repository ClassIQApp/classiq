import type { RecordingReference } from "../recording/model.ts";
import { z } from "zod";

export const spokenTokenSchema = z
    .object({
        kind: z.literal("speech"),
        text: z.string().min(1),
        startSeconds: z.number().finite().nonnegative(),
        endSeconds: z.number().finite().nonnegative(),
        language: z.string().min(1),
        speaker: z.string().optional(),
    })
    .refine((token) => token.endSeconds >= token.startSeconds);
export const tokenSchema = z.discriminatedUnion("kind", [
    spokenTokenSchema,
    z.object({ kind: z.literal("translation"), text: z.string().min(1) }),
]);
export type SpeechToken = z.infer<typeof spokenTokenSchema>;
export type TranscriptToken = z.infer<typeof tokenSchema>;
export const segmentSchema = z.object({
    text: z.string().min(1),
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().nonnegative(),
    language: z.string(),
    speakerLabel: z.string().optional(),
    spanish: z.string().optional(),
});
export const transcriptSchema = z.object({
    recordingId: z.string(),
    durationSeconds: z.number().positive(),
    language: z.string(),
    contentHash: z.string(),
    provider: z.string(),
    model: z.string(),
    translationStatus: z.enum(["succeeded", "failed"]),
    segments: z.array(segmentSchema).min(1),
});
export type Transcript = z.infer<typeof transcriptSchema>;
export interface TranscriptionProvider {
    readonly provider: string;
    readonly model: string;
    submit(
        reference: string,
        chunk: { position: number; audioStartSeconds: number; endSeconds: number; recording?: RecordingReference },
        deadline?: Date,
    ): Promise<string>;
    status(jobId: string, deadline?: Date): Promise<"pending" | "completed" | "transient_error" | "permanent_error">;
    collect(jobId: string, deadline?: Date): Promise<TranscriptToken[]>;
    release?(jobId: string, deadline?: Date): Promise<void>;
}
