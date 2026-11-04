import { RetryableStageError, PermanentStageError } from "../processing/pipeline.ts";
import type { RecordingAudioStorage } from "./audio-storage.ts";
import type { ChunkPlan } from "./chunk-planner.ts";
import type { RecordingReference } from "./model.ts";
import type { S3Client } from "@aws-sdk/client-s3";
import { S3ServiceException, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";

export class S3RecordingAudio implements RecordingAudioStorage {
    private readonly client: S3Client;
    private readonly bucket: string;
    constructor(client: S3Client, bucket: string) {
        this.client = client;
        this.bucket = bucket;
    }
    private location(reference: RecordingReference, position: number) {
        return { Bucket: this.bucket, Key: `processing/recordings/${reference.recordingId}/v1/chunks/${position}.flac` };
    }
    async upload(reference: RecordingReference, chunk: ChunkPlan, file: string, deadline?: Date) {
        const signal = deadline ? AbortSignal.timeout(Math.max(1, deadline.getTime() - Date.now())) : undefined;
        const metadata = { plan: createHash("sha256").update(JSON.stringify(chunk)).digest("hex") };
        const size = await stat(file);
        const body = createReadStream(file);
        try {
            await this.client.send(
                new PutObjectCommand({
                    ...this.location(reference, chunk.position),
                    Body: body,
                    ContentLength: size.size,
                    ContentType: "audio/flac",
                    Metadata: metadata,
                    IfNoneMatch: "*",
                }),
                { abortSignal: signal },
            );
        } catch (error) {
            if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 412) {
                const existing = await this.client.send(new HeadObjectCommand(this.location(reference, chunk.position)), {
                    abortSignal: signal,
                });
                if (existing.Metadata?.plan !== metadata.plan)
                    throw new PermanentStageError("CHUNK_PLAN_CHANGED", "Recording preparation changed. Contact support.");

                return;
            }
            throw new RetryableStageError("AUDIO_STORAGE_UNAVAILABLE", "Recording preparation could not save audio. Try again.");
        } finally {
            body.destroy();
        }
    }
    async download(reference: RecordingReference, position: number, file: string, deadline?: Date) {
        const signal = deadline ? AbortSignal.timeout(Math.max(1, deadline.getTime() - Date.now())) : undefined;
        try {
            const object = await this.client.send(new GetObjectCommand(this.location(reference, position)), { abortSignal: signal });
            if (!object.Body) throw new Error("Missing chunk body");
            await pipeline(object.Body.transformToWebStream(), createWriteStream(file, { flags: "wx" }), { signal });
        } catch {
            throw new RetryableStageError("AUDIO_STORAGE_UNAVAILABLE", "Prepared audio could not be read. Try again.");
        }
    }
}
