import { createLlmService } from "./core/ai/create-llm-service.ts";
import { ContentIndexService } from "./core/content-index/content-index-service.ts";
import { PostgresContentIndexRepository } from "./core/content-index/postgres-content-index-repository.ts";
import { readCourseResourceFileConfig } from "./core/course-resource/file/config.ts";
import { PostgresLectureContentRepository } from "./core/lecture-content/postgres-lecture-content-repository.ts";
import type { LectureDependencies } from "./core/processing/lecture-pipeline.ts";
import { PostgresProcessingRepository } from "./core/processing/postgres-processing-repository.ts";
import { FfmpegRecordingNormalizer } from "./core/recording/ffmpeg-normalizer.ts";
import { PostgresRecordingRepository } from "./core/recording/postgres-recording-repository.ts";
import { S3RecordingAudio } from "./core/recording/s3-recording-audio.ts";
import { SonioxTranscriptionProvider } from "./core/transcript/soniox-transcription-provider.ts";
import { PostgresUploadRepository } from "./core/uploads/postgres-upload-repository.ts";
import { S3UploadStorage } from "./core/uploads/s3-upload-storage.ts";
import type { S3Client } from "@aws-sdk/client-s3";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";

export function lectureDependencies(
    db: Pool,
    files: S3Client,
    external: Pick<LectureDependencies, "llm" | "normalizer" | "transcription">,
): LectureDependencies {
    const processing = new PostgresProcessingRepository(db);

    return {
        ...external,
        processing,
        uploads: new PostgresUploadRepository(db),
        storage: new S3UploadStorage(readCourseResourceFileConfig(process.env), files),
        recording: (input, context) =>
            new PostgresRecordingRepository(db, (client) =>
                processing.guard(client, { kind: "lecture", courseId: input.courseId, lectureId: input.lectureId }, context.runId),
            ),
        content: (input, context) =>
            new PostgresLectureContentRepository(db, (client) =>
                processing.guard(client, { kind: "lecture", courseId: input.courseId, lectureId: input.lectureId }, context.runId),
            ),
        index: (input, context) =>
            new ContentIndexService(
                new PostgresContentIndexRepository(db, (client) =>
                    processing.guard(client, { kind: "lecture", courseId: input.courseId, lectureId: input.lectureId }, context.runId),
                ),
            ),
    };
}
export function liveLectureDependencies(db: Pool, files: S3Client): LectureDependencies {
    const environment = {
        ...process.env,
        LLM_PROVIDER: "deepseek",
        DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL ?? "deepseek-flash",
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_KEY_FILE
            ? readFileSync(process.env.DEEPSEEK_KEY_FILE, "utf8").trim()
            : process.env.DEEPSEEK_API_KEY,
        SONIOX_API_KEY: process.env.SONIOX_KEY_FILE ? readFileSync(process.env.SONIOX_KEY_FILE, "utf8").trim() : process.env.SONIOX_API_KEY,
    };
    const config = readCourseResourceFileConfig(process.env);
    const uploads = new S3UploadStorage(config, files);
    const audio = new S3RecordingAudio(files, config.bucketName);

    return lectureDependencies(db, files, {
        llm: createLlmService(environment),
        normalizer: new FfmpegRecordingNormalizer(
            { ffmpeg: process.env.FFMPEG_PATH ?? "ffmpeg", ffprobe: process.env.FFPROBE_PATH ?? "ffprobe" },
            async (asset) => {
                const ticket = await uploads.download(asset);

                return ticket.url;
            },
            audio,
        ),
        transcription: new SonioxTranscriptionProvider(
            {
                apiKey: environment.SONIOX_API_KEY ?? "",
                model: process.env.SONIOX_MODEL ?? "stt-async-v6",
                baseUrl: "https://api.soniox.com/v1",
            },
            fetch,
            audio,
        ),
    });
}
