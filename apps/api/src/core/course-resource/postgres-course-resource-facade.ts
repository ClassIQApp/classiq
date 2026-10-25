import type { CourseResourceRepository } from "./course-resource-repository.ts";
import { CourseResourceError } from "./errors.ts";
import {
    courseResourceSchema,
    type CourseResource,
    type CourseResourceReference,
    type CourseResourceRegistration,
    type CourseResourceUploadStatus,
} from "./model.ts";
import { DatabaseError, type Pool, type QueryConfig } from "pg";

type CourseResourceRow = Omit<CourseResource, "id" | "courseId" | "contentLength"> & {
    id: number;
    courseId: number;
    contentLength: string | null;
};

const table = "course_resources";
const columns = {
    id: "id",
    courseId: "fk_course_id",
    name: "name",
    contentType: "content_type",
    contentLength: "content_length",
    uploadStatus: "upload_status",
} as const satisfies Record<keyof CourseResource, string>;
const selection = Object.entries(columns)
    .map(([property, column]) => `${column} AS "${property}"`)
    .join(", ");

// https://www.postgresql.org/docs/current/errcodes-appendix.html
const postgresErrorCodes = {
    invalidTextRepresentation: "22P02",
    numericValueOutOfRange: "22003",
    foreignKeyViolation: "23503",
} as const;

export class PostgresCourseResourceFacade implements CourseResourceRepository {
    private readonly client: Pool;

    constructor(client: typeof this.client) {
        this.client = client;
    }

    async register(courseId: string, registration: CourseResourceRegistration): Promise<CourseResource> {
        const request = {
            text: `
                INSERT INTO ${table} (${columns.courseId}, ${columns.name}, ${columns.contentType}, ${columns.contentLength})
                VALUES ($1, $2, $3, $4)
                RETURNING ${selection}
            `,
            values: [courseId, registration.name, registration.contentType, registration.contentLength],
        };

        const [resource] = await this.query(request);
        if (!resource) {
            throw new CourseResourceError("provider_error");
        }

        return resource;
    }

    async fetch(reference: CourseResourceReference): Promise<CourseResource | undefined> {
        const request = {
            text: `
                SELECT ${selection} FROM ${table}
                WHERE ${columns.courseId} = $1 AND ${columns.id} = $2
            `,
            values: [reference.courseId, reference.resourceId],
        };

        const [resource] = await this.query(request);

        return resource;
    }

    async listCourseResources(courseId: string): Promise<CourseResource[]> {
        const request = {
            text: `SELECT ${selection} FROM ${table} WHERE ${columns.courseId} = $1 ORDER BY ${columns.id}`,
            values: [courseId],
        };

        return this.query(request);
    }

    async updateUploadStatus(
        reference: CourseResourceReference,
        status: CourseResourceUploadStatus,
        allowedStatuses: readonly CourseResourceUploadStatus[],
    ): Promise<CourseResource | undefined> {
        const request = {
            text: `
                UPDATE ${table}
                SET ${columns.uploadStatus} = $3, last_updated_at = CURRENT_TIMESTAMP
                WHERE ${columns.courseId} = $1 AND ${columns.id} = $2 AND ${columns.uploadStatus} = ANY($4::text[])
                RETURNING ${selection}
            `,
            values: [reference.courseId, reference.resourceId, status, allowedStatuses],
        };

        const [resource] = await this.query(request);

        return resource;
    }

    private async query(request: QueryConfig<(string | number | readonly CourseResourceUploadStatus[])[]>): Promise<CourseResource[]> {
        try {
            const response = await this.client.query<CourseResourceRow>(request);

            return response.rows.map((row) => this.convertResource(row));
        } catch (error) {
            throw this.convertError(error);
        }
    }

    private convertResource(row: CourseResourceRow): CourseResource {
        const resource = courseResourceSchema.safeParse({
            ...row,
            id: String(row.id),
            courseId: String(row.courseId),
            contentLength: row.contentLength === null ? null : Number(row.contentLength),
        });

        if (!resource.success) {
            throw new CourseResourceError("provider_error");
        }

        return resource.data;
    }

    private convertError(error: unknown): CourseResourceError {
        if (error instanceof CourseResourceError) {
            return error;
        }

        if (error instanceof DatabaseError) {
            switch (error.code) {
                case postgresErrorCodes.invalidTextRepresentation:
                case postgresErrorCodes.numericValueOutOfRange:
                    return new CourseResourceError("invalid_reference");
                case postgresErrorCodes.foreignKeyViolation:
                    return new CourseResourceError("not_found");
            }
        }

        return new CourseResourceError("provider_error");
    }
}
