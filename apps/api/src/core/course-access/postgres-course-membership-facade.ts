import type { CourseMembershipRepository } from "./course-membership-repository.ts";
import { CourseAccessError } from "./errors.ts";
import { courseRoleSchema, type CourseMembership, type CourseRole } from "./model.ts";
import { DatabaseError, type Pool, type QueryConfig } from "pg";

interface CourseMembershipRow {
    courseId: number;
    userId: number;
    role: string;
}

const table = "course_memberships";
const columns = {
    courseId: "course_id",
    userId: "user_id",
    role: "role",
} as const satisfies Record<keyof CourseMembership, string>;
const selection = Object.entries(columns)
    .map(([property, column]) => `${table}.${column} AS "${property}"`)
    .join(", ");

// https://www.postgresql.org/docs/current/errcodes-appendix.html
const postgresErrorCodes = {
    invalidTextRepresentation: "22P02",
    numericValueOutOfRange: "22003",
} as const;

export class PostgresCourseMembershipFacade implements CourseMembershipRepository {
    private readonly client: Pick<Pool, "query">;

    constructor(client: typeof this.client) {
        this.client = client;
    }

    async create(membership: CourseMembership): Promise<CourseMembership> {
        const request = {
            text: `
                INSERT INTO ${table} (${columns.courseId}, ${columns.userId}, ${columns.role})
                VALUES ($1, $2, $3)
                RETURNING ${selection}
            `,
            values: [membership.courseId, membership.userId, membership.role],
        };

        const [created] = await this.query(request);
        if (!created) {
            throw new CourseAccessError("provider_error");
        }

        return created;
    }

    async fetchRole(courseId: string, userId: string): Promise<CourseRole | undefined> {
        const request = {
            text: `SELECT ${selection} FROM ${table} WHERE ${columns.courseId} = $1 AND ${columns.userId} = $2`,
            values: [courseId, userId],
        };

        const [membership] = await this.query(request);

        return membership?.role;
    }

    private async query(request: QueryConfig<string[]>): Promise<CourseMembership[]> {
        try {
            const response = await this.client.query<CourseMembershipRow>(request);

            return response.rows.map((row) => this.convertMembership(row));
        } catch (error) {
            if (this.isInvalidReference(error)) {
                return [];
            }

            throw new CourseAccessError("provider_error");
        }
    }

    private convertMembership(row: CourseMembershipRow): CourseMembership {
        const role = courseRoleSchema.safeParse(row.role);
        if (!role.success) {
            throw new CourseAccessError("provider_error");
        }

        return { courseId: String(row.courseId), userId: String(row.userId), role: role.data };
    }

    private isInvalidReference(error: unknown): boolean {
        return (
            error instanceof DatabaseError &&
            (error.code === postgresErrorCodes.invalidTextRepresentation || error.code === postgresErrorCodes.numericValueOutOfRange)
        );
    }
}
