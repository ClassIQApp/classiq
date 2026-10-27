import { PostgresCourseResourceFacade } from "../course-resource/postgres-course-resource-facade.ts";
import { UploadError, type UploadAsset, type UploadInput, type UploadKind, type UploadRepository } from "./model.ts";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

interface AssetRow {
    id: string;
    upload_id: string;
    kind: UploadKind;
    course_id: number;
    lecture_id: number | null;
    resource_id: number | null;
    name: string;
    content_type: string;
    content_length: string;
    upload_status: UploadAsset["uploadStatus"];
}

function convert(row: AssetRow): UploadAsset {
    return {
        id: row.id,
        uploadId: row.upload_id,
        kind: row.kind,
        courseId: String(row.course_id),
        ...(row.lecture_id === null ? {} : { lectureId: String(row.lecture_id) }),
        ...(row.resource_id === null ? {} : { resourceId: String(row.resource_id) }),
        name: row.name,
        contentType: row.content_type,
        contentLength: Number(row.content_length),
        uploadStatus: row.upload_status,
    };
}

export class PostgresUploadRepository implements UploadRepository {
    private readonly db: Pool;

    constructor(db: Pool) {
        this.db = db;
    }

    async checkParent(courseId: string, lectureId?: string): Promise<void> {
        const result =
            lectureId === undefined
                ? await this.db.query("SELECT id FROM courses WHERE id = $1", [courseId])
                : await this.db.query("SELECT id FROM lectures WHERE fk_course_id = $1 AND id = $2", [courseId, lectureId]);

        if (!result.rowCount) {
            throw new UploadError(404, "NOT_FOUND", "Course or lecture was not found.");
        }
    }

    async initiate(kind: UploadKind, courseId: string, input: UploadInput, idempotencyKey?: string): Promise<UploadAsset> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");

            const parent = await client.query("SELECT id FROM courses WHERE id = $1 FOR UPDATE", [courseId]);

            if (!parent.rowCount) {
                throw new UploadError(404, "NOT_FOUND", "Course was not found.");
            }

            if (input.lectureId !== undefined) {
                const lecture = await client.query("SELECT id FROM lectures WHERE fk_course_id = $1 AND id = $2 FOR UPDATE", [
                    courseId,
                    input.lectureId,
                ]);

                if (!lecture.rowCount) {
                    throw new UploadError(404, "NOT_FOUND", "Lecture was not found.");
                }
            }

            if (idempotencyKey !== undefined) {
                const previous = await client.query<AssetRow>("SELECT * FROM upload_assets WHERE course_id = $1 AND idempotency_key = $2", [
                    courseId,
                    idempotencyKey,
                ]);

                if (previous.rows[0]) {
                    const asset = convert(previous.rows[0]);

                    if (
                        asset.kind !== kind ||
                        asset.lectureId !== input.lectureId ||
                        asset.name !== input.name ||
                        asset.contentType !== input.contentType ||
                        asset.contentLength !== input.contentLength ||
                        asset.uploadStatus !== "pending"
                    ) {
                        throw new UploadError(409, "UPLOAD_CONFLICT", "Idempotency key was already used for another upload.");
                    }

                    await client.query("COMMIT");

                    return asset;
                }
            }

            if (kind === "recording") {
                const existing = await client.query<AssetRow>(
                    "SELECT * FROM upload_assets WHERE kind = 'recording' AND course_id = $1 AND lecture_id = $2",
                    [courseId, input.lectureId],
                );

                if (existing.rows[0]) {
                    const asset = convert(existing.rows[0]);

                    if (
                        asset.uploadStatus !== "pending" ||
                        asset.name !== input.name ||
                        asset.contentType !== input.contentType ||
                        asset.contentLength !== input.contentLength
                    ) {
                        throw new UploadError(409, "UPLOAD_CONFLICT", "A recording already exists for this lecture.");
                    }

                    await client.query("COMMIT");

                    return asset;
                }
            }

            const resource = kind === "resource" ? await new PostgresCourseResourceFacade(client).register(courseId, input) : undefined;

            if (resource && input.lectureId !== undefined) {
                await client.query("UPDATE course_resources SET fk_lecture_id = $2 WHERE id = $1", [resource.id, input.lectureId]);
            }

            const result = await client.query<AssetRow>(
                `
                INSERT INTO upload_assets (
                    id, upload_id, kind, course_id, lecture_id, resource_id,
                    name, content_type, content_length, idempotency_key
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *
                `,
                [
                    randomUUID(),
                    randomUUID(),
                    kind,
                    courseId,
                    input.lectureId ?? null,
                    resource?.id ?? null,
                    input.name,
                    input.contentType,
                    input.contentLength,
                    idempotencyKey ?? null,
                ],
            );

            const row = result.rows[0];

            if (!row) {
                throw new Error("Upload operation returned no record");
            }

            await client.query("COMMIT");

            return convert(row);
        } catch (error) {
            await client.query("ROLLBACK");

            throw error;
        } finally {
            client.release();
        }
    }

    async find(courseId: string, kind: UploadKind, parentId: string): Promise<UploadAsset | undefined> {
        const parentColumn = kind === "recording" ? "lecture_id" : "resource_id";

        const result = await this.db.query<AssetRow>(
            `
            SELECT *
            FROM upload_assets
            WHERE course_id = $1
                AND kind = $2
                AND ${parentColumn} = $3
            `,
            [courseId, kind, parentId],
        );

        return result.rows[0] ? convert(result.rows[0]) : undefined;
    }

    async complete(asset: UploadAsset): Promise<UploadAsset> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");

            const locked = await client.query<AssetRow>(
                "SELECT * FROM upload_assets WHERE id = $1 AND upload_id = $2 AND course_id = $3 FOR UPDATE",
                [asset.id, asset.uploadId, asset.courseId],
            );

            const current = locked.rows[0];

            if (!current || current.upload_status === "failed") {
                throw new UploadError(409, "UPLOAD_CONFLICT", "Upload cannot be completed.");
            }

            if (current.upload_status === "uploaded") {
                await client.query("COMMIT");

                return convert(current);
            }

            const result = await client.query<AssetRow>("UPDATE upload_assets SET upload_status = 'uploaded' WHERE id = $1 RETURNING *", [
                asset.id,
            ]);

            if (asset.kind === "resource") {
                const resource = await new PostgresCourseResourceFacade(client).updateUploadStatus(
                    { courseId: asset.courseId, resourceId: asset.resourceId! },
                    "uploaded",
                    ["pending", "uploaded"],
                );

                if (!resource) {
                    throw new UploadError(409, "UPLOAD_CONFLICT", "Resource metadata cannot be completed.");
                }
            } else {
                await client.query(
                    `
                UPDATE lectures
                SET status = 'uploaded', status_message = 'Recording uploaded.', last_updated_at = CURRENT_TIMESTAMP
                WHERE fk_course_id = $1
                    AND id = $2
                `,
                    [asset.courseId, asset.lectureId],
                );
            }

            const row = result.rows[0];

            if (!row) {
                throw new Error("Upload operation returned no record");
            }

            await client.query("COMMIT");

            return convert(row);
        } catch (error) {
            await client.query("ROLLBACK");

            throw error;
        } finally {
            client.release();
        }
    }

    async listResources(courseId: string): Promise<UploadAsset[]> {
        const result = await this.db.query<AssetRow>(
            "SELECT * FROM upload_assets WHERE course_id = $1 AND kind = 'resource' ORDER BY resource_id",
            [courseId],
        );

        return result.rows.map((row) => convert(row));
    }
}
