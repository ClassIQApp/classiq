import type { UploadAsset } from "../uploads/model.ts";
import { FfmpegRecordingNormalizer } from "./ffmpeg-normalizer.ts";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);
it.skipIf(process.env.PROCESSING_TEST_LOCAL !== "1")(
    "decodes actual media, detects silence, uploads real mono FLAC chunks and rejects corrupt input",
    async () => {
        const directory = await mkdtemp(path.join(tmpdir(), "media-test-"));
        const asset: UploadAsset = {
            id: "recording",
            uploadId: "upload",
            kind: "recording",
            courseId: "1",
            lectureId: "2",
            uploadStatus: "uploaded",
            name: "lecture.webm",
            contentType: "audio/webm",
            contentLength: 1,
        };
        try {
            const source = path.join(directory, "source.webm");
            await execute("ffmpeg", [
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=2",
                "-f",
                "lavfi",
                "-i",
                "anullsrc=r=48000:cl=mono:d=1",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=550:duration=2",
                "-filter_complex",
                "[0:a][1:a][2:a]concat=n=3:v=0:a=1",
                "-c:a",
                "libopus",
                source,
            ]);
            const saved: string[] = [];
            const normalizer = new FfmpegRecordingNormalizer(
                {
                    ffmpeg: "ffmpeg",
                    ffprobe: "ffprobe",
                    chunks: { targetSeconds: 2.5, singleChunkMaxSeconds: 3, windowSeconds: 0.5, overlapSeconds: 0.25 },
                },
                async () => source,
                {
                    upload: async (_, chunk, file) => {
                        const target = path.join(directory, `${chunk.position}.flac`);
                        await copyFile(file, target);
                        saved.push(target);
                    },
                },
            );
            const result = await normalizer.normalize(asset);
            expect(result.durationSeconds).toBeCloseTo(5, 1);
            expect(result.silences).toEqual([
                expect.objectContaining({ startSeconds: expect.closeTo(2, 1), endSeconds: expect.closeTo(3, 1) }),
            ]);
            expect(result.preparedChunks).toHaveLength(2);
            for (const file of saved) {
                const header = await readFile(file);
                expect(header.subarray(0, 4).toString()).toBe("fLaC");
                const probe = await execute("ffprobe", ["-v", "error", "-show_streams", "-of", "json", file]);
                expect(JSON.parse(probe.stdout).streams[0]).toMatchObject({ codec_name: "flac", channels: 1, sample_rate: "16000" });
            }
            const invalid = new FfmpegRecordingNormalizer(
                { ffmpeg: "ffmpeg", ffprobe: "ffprobe" },
                async () => path.join(directory, "missing"),
                { upload: async () => {} },
            );
            await expect(invalid.normalize(asset)).rejects.toMatchObject({ code: "INVALID_RECORDING" });
            await expect(normalizer.normalize(asset, new Date(0))).rejects.toMatchObject({ code: "NORMALIZATION_TIMEOUT" });
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    },
);
