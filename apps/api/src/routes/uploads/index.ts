import type { CourseResourceFileConfig } from "../../core/course-resource/file/config.ts";
import {
    UploadError,
    publicAsset,
    type UploadInput,
    type UploadKind,
    type UploadRepository,
    type UploadStorage,
} from "../../core/uploads/model.ts";
import { PostgresUploadRepository } from "../../core/uploads/postgres-upload-repository.ts";
import { S3UploadStorage } from "../../core/uploads/s3-upload-storage.ts";
import type { S3Client } from "@aws-sdk/client-s3";
import { Hono, type Env, type MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import { z } from "zod";

const id = z
    .string()
    .regex(/^[1-9]\d{0,9}$/)
    .refine((value) => Number(value) <= 2_147_483_647);

const baseInput = z.object({
    name: z.string().trim().min(1).max(255),
    contentType: z.string(),
    contentLength: z.number().int().positive(),
});

const recordingInput = baseInput
    .extend({
        contentType: z.enum(["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/webm", "video/mp4", "video/webm"]),
        contentLength: z
            .number()
            .int()
            .positive()
            .max(500 * 1024 ** 2),
    })
    .strict();

const resourceInput = baseInput
    .extend({
        contentType: z.literal("application/pdf"),
        contentLength: z
            .number()
            .int()
            .positive()
            .max(25 * 1024 ** 2),
        lectureId: id.optional(),
    })
    .strict();

const completionInput = z.object({ uploadId: z.uuid() }).strict();

export interface UploadRouteDependencies<E extends Env> {
    requireCourseRole: (role: "member" | "teacher") => MiddlewareHandler<E>;
    repository: UploadRepository;
    storage: UploadStorage;
}

const validateParents: MiddlewareHandler = async (c, next) => {
    id.parse(c.req.param("courseId"));

    for (const param of ["lectureId", "resourceId"]) {
        const value = c.req.param(param);

        if (value !== undefined) {
            id.parse(value);
        }
    }

    await next();
};

export function createUploadRoutes<E extends Env>(dependencies: UploadRouteDependencies<E>) {
    const { requireCourseRole, repository, storage } = dependencies;

    if (typeof requireCourseRole !== "function") {
        throw new TypeError("Course authorization middleware is required");
    }

    const teacher = requireCourseRole("teacher");
    const member = requireCourseRole("member");

    if (typeof teacher !== "function" || typeof member !== "function") {
        throw new TypeError("Course authorization middleware is required");
    }

    const routes = new Hono<E>();

    routes.onError((error, c) => {
        if (error instanceof UploadError) {
            return c.json({ code: error.code, message: error.message }, error.status);
        }

        if (error instanceof z.ZodError || error instanceof SyntaxError) {
            return c.json({ code: "INVALID_UPLOAD", message: "Invalid upload request." }, 400);
        }

        return c.json({ code: "UPLOAD_UNAVAILABLE", message: "Upload service is unavailable." }, 503);
    });

    routes.use(async (c, next) => {
        c.header("Cache-Control", "private, no-store");

        await next();
    });

    async function find(courseId: string, kind: UploadKind, parentId: string) {
        await repository.checkParent(courseId, kind === "recording" ? parentId : undefined);

        const asset = await repository.find(courseId, kind, parentId);

        if (!asset) {
            throw new UploadError(404, "NOT_FOUND", "File was not found.");
        }

        return asset;
    }

    for (const kind of ["recording", "resource"] as const) {
        const root = kind === "recording" ? "/:courseId/lectures/:lectureId/recording" : "/:courseId/resources";
        const item = kind === "recording" ? root : `${root}/:resourceId`;

        routes.post(`${root}/upload`, validateParents, teacher, async (c) => {
            const body: UploadInput = (kind === "recording" ? recordingInput : resourceInput).parse(await c.req.json());

            if (kind === "recording") {
                body.lectureId = c.req.param("lectureId");
            }

            await repository.checkParent(c.req.param("courseId")!, body.lectureId);

            const idempotencyKey = z.uuid().optional().parse(c.req.header("Idempotency-Key"));

            const asset = await repository.initiate(kind, c.req.param("courseId")!, body, idempotencyKey);

            return c.json(await storage.ticket(asset), 201);
        });

        routes.post(`${item}/complete`, validateParents, teacher, async (c) => {
            const { uploadId } = completionInput.parse(await c.req.json());

            const asset = await find(c.req.param("courseId")!, kind, c.req.param(kind === "recording" ? "lectureId" : "resourceId")!);

            if (asset.uploadId !== uploadId) {
                throw new UploadError(409, "UPLOAD_CONFLICT", "Upload ticket does not match this file.");
            }

            if (asset.uploadStatus === "failed") {
                throw new UploadError(409, "UPLOAD_CONFLICT", "Upload has failed.");
            }

            if (asset.uploadStatus !== "uploaded") {
                await storage.verify(asset);
            }

            return c.json(publicAsset(await repository.complete(asset)));
        });

        routes.get(`${item}/download`, validateParents, member, async (c) => {
            const asset = await find(c.req.param("courseId")!, kind, c.req.param(kind === "recording" ? "lectureId" : "resourceId")!);

            if (asset.uploadStatus !== "uploaded") {
                throw new UploadError(404, "NOT_FOUND", "File has not been uploaded.");
            }

            c.header("Cache-Control", "private, no-store");

            return c.json(await storage.download(asset));
        });

        routes.get(root, validateParents, member, async (c) => {
            c.header("Cache-Control", "private, no-store");

            if (kind === "recording") {
                return c.json(publicAsset(await find(c.req.param("courseId")!, kind, c.req.param("lectureId")!)));
            }

            await repository.checkParent(c.req.param("courseId")!);

            const assets = await repository.listResources(c.req.param("courseId")!);

            return c.json({ items: assets.map((asset) => publicAsset(asset)) });
        });
    }

    return routes;
}

export function createPersistentUploadRoutes<E extends Env>(options: {
    requireCourseRole: UploadRouteDependencies<E>["requireCourseRole"];
    database: Pool;
    s3: S3Client;
    fileConfig: CourseResourceFileConfig;
}) {
    return createUploadRoutes<E>({
        requireCourseRole: options.requireCourseRole,
        repository: new PostgresUploadRepository(options.database),
        storage: new S3UploadStorage(options.fileConfig, options.s3),
    });
}
