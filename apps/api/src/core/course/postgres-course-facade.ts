import type { CourseMembership } from "../course-access/model.ts";
import { PostgresCourseMembershipFacade } from "../course-access/postgres-course-membership-facade.ts";
import type { CourseRepository } from "./course-repository.ts";
import { CourseError } from "./errors.ts";
import {
    courseSchema,
    memberCourseSchema,
    type Course,
    type CourseMetadataUpdate,
    type CourseRegistration,
    type MemberCourse,
} from "./model.ts";
import { DatabaseError, type Pool, type QueryConfig } from "pg";

type CourseRow = Omit<Course, "id"> & { id: number };
type MemberCourseRow = CourseRow & { role: string };

const table = "courses";
const columns = {
    id: "id",
    code: "code",
    name: "name",
    slug: "slug",
    description: "description",
} as const satisfies Record<keyof Course, string>;
const selection = Object.entries(columns)
    .map(([property, column]) => `${table}.${column} AS "${property}"`)
    .join(", ");

// https://www.postgresql.org/docs/current/errcodes-appendix.html
const postgresErrorCodes = {
    invalidTextRepresentation: "22P02",
    numericValueOutOfRange: "22003",
    uniqueViolation: "23505",
} as const;

export class PostgresCourseFacade implements CourseRepository {
    private readonly client: Pool;

    constructor(client: typeof this.client) {
        this.client = client;
    }

    async register(registration: CourseRegistration, creator: Omit<CourseMembership, "courseId">): Promise<MemberCourse> {
        const request = {
            text: `
                INSERT INTO ${table} (${columns.code}, ${columns.name}, ${columns.slug}, ${columns.description})
                VALUES ($1, $2, $3, $4)
                RETURNING ${selection}
            `,
            values: [registration.code, registration.name, registration.slug, registration.description],
        };

        const transaction = await this.client.connect();

        try {
            await transaction.query("BEGIN");

            const [course] = await this.query(request, transaction);
            if (!course) {
                throw new CourseError("provider_error");
            }

            const membership = await new PostgresCourseMembershipFacade(transaction).create({ ...creator, courseId: course.id });

            await transaction.query("COMMIT");

            return { ...course, role: membership.role };
        } catch (error) {
            await transaction.query("ROLLBACK");

            throw this.convertError(error);
        } finally {
            transaction.release();
        }
    }

    async fetch(courseId: string): Promise<Course | undefined> {
        const request = {
            text: `SELECT ${selection} FROM ${table} WHERE ${columns.id} = $1`,
            values: [courseId],
        };

        const [course] = await this.query(request);

        return course;
    }

    async listMemberCourses(userId: string): Promise<MemberCourse[]> {
        const request = {
            text: `
                SELECT ${selection}, course_memberships.role AS "role"
                FROM ${table}
                JOIN course_memberships ON course_memberships.course_id = ${table}.${columns.id}
                WHERE course_memberships.user_id = $1
                ORDER BY ${table}.${columns.id}
            `,
            values: [userId],
        };

        try {
            const response = await this.client.query<MemberCourseRow>(request);

            return response.rows.map((row) => this.convertMemberCourse(row));
        } catch (error) {
            throw this.convertError(error);
        }
    }

    async updateMetadata(courseId: string, update: CourseMetadataUpdate): Promise<Course | undefined> {
        const request = {
            text: `
                UPDATE ${table}
                SET ${columns.code} = COALESCE($2, ${columns.code}),
                    ${columns.name} = COALESCE($3, ${columns.name}),
                    ${columns.slug} = COALESCE($4, ${columns.slug}),
                    ${columns.description} = COALESCE($5, ${columns.description}),
                    last_updated_at = CURRENT_TIMESTAMP
                WHERE ${columns.id} = $1
                RETURNING ${selection}
            `,
            values: [courseId, update.code, update.name, update.slug, update.description],
        };

        const [course] = await this.query(request);

        return course;
    }

    private async query(request: QueryConfig<(string | undefined)[]>, client: Pick<Pool, "query"> = this.client): Promise<Course[]> {
        try {
            const response = await client.query<CourseRow>(request);

            return response.rows.map((row) => this.convertCourse(row));
        } catch (error) {
            throw this.convertError(error);
        }
    }

    private convertCourse(row: CourseRow): Course {
        const course = courseSchema.safeParse({ ...row, id: String(row.id) });
        if (!course.success) {
            throw new CourseError("provider_error");
        }

        return course.data;
    }

    private convertMemberCourse(row: MemberCourseRow): MemberCourse {
        const course = memberCourseSchema.safeParse({ ...row, id: String(row.id) });
        if (!course.success) {
            throw new CourseError("provider_error");
        }

        return course.data;
    }

    private convertError(error: unknown): CourseError {
        if (error instanceof CourseError) {
            return error;
        }

        if (error instanceof DatabaseError) {
            switch (error.code) {
                case postgresErrorCodes.invalidTextRepresentation:
                case postgresErrorCodes.numericValueOutOfRange:
                    return new CourseError("invalid_reference");
                case postgresErrorCodes.uniqueViolation:
                    return new CourseError("conflict");
            }
        }

        return new CourseError("provider_error");
    }
}
