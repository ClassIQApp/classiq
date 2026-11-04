import { PermanentStageError, RetryableStageError } from "../processing/pipeline.ts";
import type { UploadAsset } from "../uploads/model.ts";
import type { RecordingAudioStorage } from "./audio-storage.ts";
import { planChunks, defaultChunkOptions, type ChunkOptions, type TimeSpan } from "./chunk-planner.ts";
import type { RecordingNormalizer } from "./model.ts";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const execute = promisify(execFile);
const probeSchema = z.object({
    streams: z.array(z.object({ codec_type: z.string(), sample_rate: z.string().optional() })),
    format: z.object({ duration: z.coerce.number().positive().finite() }),
});
export interface FfmpegConfig {
    ffmpeg: string;
    ffprobe: string;
    chunks?: ChunkOptions;
}

export class FfmpegRecordingNormalizer implements RecordingNormalizer {
    readonly preparesAudio = true;
    private readonly config: FfmpegConfig;
    private readonly source: (asset: UploadAsset) => Promise<string>;
    private readonly audio: Pick<RecordingAudioStorage, "upload">;
    constructor(config: FfmpegConfig, source: (asset: UploadAsset) => Promise<string>, audio: Pick<RecordingAudioStorage, "upload">) {
        this.config = config;
        this.source = source;
        this.audio = audio;
    }
    private async run(binary: string, args: string[], deadline: Date) {
        const timeout = deadline.getTime() - Date.now();
        if (timeout <= 0) throw new RetryableStageError("NORMALIZATION_TIMEOUT", "Recording preparation timed out. Try again.");
        try {
            return await execute(binary, args, { timeout, killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024 });
        } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT")
                throw new PermanentStageError("FFMPEG_MISSING", "Media processing is not configured. Contact support.");
            if (error instanceof Error && "killed" in error && error.killed)
                throw new RetryableStageError("NORMALIZATION_TIMEOUT", "Recording preparation timed out. Try again.");
            throw new PermanentStageError("INVALID_RECORDING", "The recording could not be decoded. Check its audio and try again.");
        }
    }
    async normalize(asset: UploadAsset, deadline = new Date(Date.now() + 900_000)) {
        if (!asset.lectureId) throw new Error("Recording has no lecture identity.");
        const directory = await mkdtemp(path.join(tmpdir(), "classiq-audio-"));
        try {
            const normalized = path.join(directory, "normalized.flac");
            const source = await this.source(asset);
            const decoded = await this.run(
                this.config.ffmpeg,
                [
                    "-nostdin",
                    "-hide_banner",
                    "-nostats",
                    "-format_whitelist",
                    "mov,mp3,wav,matroska,webm",
                    "-i",
                    source,
                    "-map",
                    "0:a:0",
                    "-vn",
                    "-ac",
                    "1",
                    "-ar",
                    "16000",
                    "-af",
                    "silencedetect=noise=-35dB:d=0.6",
                    "-c:a",
                    "flac",
                    normalized,
                ],
                deadline,
            );
            const probe = await this.run(
                this.config.ffprobe,
                ["-v", "error", "-show_streams", "-show_format", "-of", "json", normalized],
                deadline,
            );
            const metadata = probeSchema.parse(JSON.parse(probe.stdout));
            const durationSeconds = metadata.format.duration;
            const silences: TimeSpan[] = [];
            let start: number | undefined;
            for (const match of decoded.stderr.matchAll(/silence_(start|end):\s*([\d.]+)/g)) {
                const seconds = Math.min(durationSeconds, Number(match[2]));
                if (match[1] === "start") start = seconds;
                else if (start !== undefined) {
                    silences.push({ startSeconds: start, endSeconds: seconds });
                    start = undefined;
                }
            }
            if (start !== undefined) silences.push({ startSeconds: start, endSeconds: durationSeconds });
            const preparedChunks = planChunks(durationSeconds, silences, this.config.chunks ?? defaultChunkOptions);
            for (const chunk of preparedChunks) {
                const file = path.join(directory, `${chunk.position}.flac`);
                await this.run(
                    this.config.ffmpeg,
                    [
                        "-nostdin",
                        "-v",
                        "error",
                        "-i",
                        normalized,
                        "-ss",
                        String(chunk.audioStartSeconds),
                        "-t",
                        String(chunk.endSeconds - chunk.audioStartSeconds),
                        "-map",
                        "0:a:0",
                        "-ac",
                        "1",
                        "-ar",
                        "16000",
                        "-c:a",
                        "flac",
                        file,
                    ],
                    deadline,
                );
                await this.audio.upload(
                    { courseId: asset.courseId, lectureId: asset.lectureId, recordingId: asset.id },
                    chunk,
                    file,
                    deadline,
                );
                await rm(file);
            }

            return { durationSeconds, silences, preparedChunks };
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    }
}
