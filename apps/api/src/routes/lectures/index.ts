import type { CourseRole } from "../../core/course-access/model.ts";
import { PostgresLectureContentRepository } from "../../core/lecture-content/postgres-lecture-content-repository.ts";
import { PostgresLectureRepository } from "../../core/lecture/postgres-lecture-repository.ts";
import { lecturePipeline, lectureStages } from "../../core/processing/lecture-pipeline.ts";
import { PostgresProcessingRepository } from "../../core/processing/postgres-processing-repository.ts";
import type { ProcessingService } from "../../core/processing/processing-service.ts";
import { PostgresRecordingRepository } from "../../core/recording/postgres-recording-repository.ts";
import { UploadError } from "../../core/uploads/model.ts";
import { PostgresUploadRepository } from "../../core/uploads/postgres-upload-repository.ts";
import { Hono, type Env, type MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import { z } from "zod";

const readOnly = async () => {
    throw new Error("Read-only lecture view.");
};

export function createLectureRoutes<E extends Env>(dependencies: {
    getDb: () => Pool;
    getProcessing: () => ProcessingService;
    requireCourseRole: (role: CourseRole) => MiddlewareHandler<E>;
}) {
    const routes = new Hono<E>();
    const root = "/:courseId/lectures/:lectureId";
    const member = dependencies.requireCourseRole("member");
    const teacher = dependencies.requireCourseRole("teacher");

    routes.onError((error, c) => {
        if (error instanceof UploadError) return c.json({ code: error.code, message: error.message }, error.status);
        if (error instanceof z.ZodError) return c.json({ code: "INVALID_REQUEST", message: "Invalid lecture request." }, 400);

        return c.json({ code: "LECTURE_UNAVAILABLE", message: "Lecture content is temporarily unavailable." }, 503);
    });
    routes.use(`${root}/*`, async (c, next) => {
        c.header("Cache-Control", "private, no-store");
        const id = z.coerce.number().int().positive().max(2_147_483_647);
        id.parse(c.req.param("courseId"));
        id.parse(c.req.param("lectureId"));
        await next();
    });

    routes.get(`${root}/processing`, member, async (c) => {
        const courseId = c.req.param("courseId")!;
        const lectureId = c.req.param("lectureId")!;
        const db = dependencies.getDb();
        await new PostgresUploadRepository(db).checkParent(courseId, lectureId);
        const processing = new PostgresProcessingRepository(db);
        const subject = { kind: "lecture", courseId, lectureId } as const;
        const run = await processing.current(subject);
        const [lecture, stages, chunks] = await Promise.all([
            new PostgresLectureRepository(db).getLecture(courseId, lectureId),
            processing.stages(subject),
            db.query<{ total: number; collected: number }>(
                `SELECT count(*)::int AS total, count(tokens)::int AS collected
                 FROM recording_chunks WHERE course_id=$1 AND lecture_id=$2`,
                [courseId, lectureId],
            ),
        ]);

        return c.json({
            status: lecture!.status,
            statusMessage: run?.status === "failed" ? run.status_message : lecture!.statusMessage,
            run: run ? { id: run.id, number: run.number, status: run.status } : null,
            stages: lectureStages.map((stage) => {
                const stored = stages.find((item) => item.stage === stage);

                return {
                    stage,
                    status: stored?.status ?? "pending",
                    statusMessage: stored?.status_message ?? "",
                    attempts: stored?.attempts ?? 0,
                    updatedAt: stored?.updated_at ?? null,
                };
            }),
            chunks: chunks.rows[0],
        });
    });

    routes.post(`${root}/processing/retry`, teacher, async (c) => {
        const courseId = c.req.param("courseId")!;
        const lectureId = c.req.param("lectureId")!;
        const uploads = new PostgresUploadRepository(dependencies.getDb());
        await uploads.checkParent(courseId, lectureId);
        const asset = await uploads.find(courseId, "recording", lectureId);
        if (asset?.uploadStatus !== "uploaded") {
            throw new UploadError(409, "RECORDING_REQUIRED", "Upload a recording before starting processing.");
        }
        const run = await dependencies
            .getProcessing()
            .start({ kind: "lecture", courseId, lectureId }, lectureStages, lecturePipeline.timeoutSeconds);

        return c.json({ processing: run });
    });

    routes.get(`${root}/transcript`, member, async (c) => {
        const courseId = c.req.param("courseId")!;
        const lectureId = c.req.param("lectureId")!;
        await new PostgresUploadRepository(dependencies.getDb()).checkParent(courseId, lectureId);
        const transcript = await new PostgresRecordingRepository(dependencies.getDb(), readOnly).transcript(courseId, lectureId);
        if (!transcript) throw new UploadError(404, "NOT_FOUND", "Transcript is not available yet.");

        return c.json(transcript);
    });

    routes.get(`${root}/transcript/translations/es`, member, async (c) => {
        const courseId = c.req.param("courseId")!;
        const lectureId = c.req.param("lectureId")!;
        await new PostgresUploadRepository(dependencies.getDb()).checkParent(courseId, lectureId);
        const transcript = await new PostgresRecordingRepository(dependencies.getDb(), readOnly).transcript(courseId, lectureId);
        if (!transcript || transcript.translationStatus !== "succeeded") {
            throw new UploadError(404, "NOT_FOUND", "Spanish translation is not available yet.");
        }

        return c.json({
            language: "es",
            provider: transcript.provider,
            model: transcript.model,
            segments: transcript.segments.map((segment) => ({
                ...segment,
                text: segment.language === "es" ? segment.text : segment.spanish,
            })),
        });
    });

    routes.get(`${root}/generated-content/:kind`, member, async (c) => {
        const courseId = c.req.param("courseId")!;
        const lectureId = c.req.param("lectureId")!;
        const kind = z.enum(["summary", "key_terms"]).parse(c.req.param("kind"));
        await new PostgresUploadRepository(dependencies.getDb()).checkParent(courseId, lectureId);
        const output = await new PostgresLectureContentRepository(dependencies.getDb(), readOnly).read({ courseId, lectureId }, kind);
        if (!output) throw new UploadError(404, "NOT_FOUND", "Generated content is not available yet.");

        return c.json(output);
    });

    return routes;
}
