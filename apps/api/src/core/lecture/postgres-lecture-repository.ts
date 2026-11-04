import type { ContentKind } from "../lecture-content/model.ts";
import type { CreateLectureInput, LectureRepository, UpdateLectureInput } from "./lecture-repository.ts";
import type { Lecture } from "./model.ts";
import { DatabaseError, type Pool } from "pg";

interface LectureRow {
    id: number;
    fk_course_id: number;
    title: string;
    description: string;
    status: Lecture["status"];
    status_message: string;
    has_transcript?: boolean;
    content_kinds?: ContentKind[];
}

// https://www.postgresql.org/docs/current/errcodes-appendix.html
const postgresErrorCodes = {
    invalidTextRepresentation: "22P02",
    numericValueOutOfRange: "22003",
} as const;

function toLecture(row: LectureRow): Lecture {
    return {
        id: String(row.id),
        title: row.title,
        description: row.description,
        status: row.status,
        statusMessage: row.status_message,
        transcript: row.has_transcript
            ? {
                  id: "transcript",
                  title: "Transcript",
                  description: "Source transcript",
                  href: `/courses/${row.fk_course_id}/lectures/${row.id}/transcript`,
              }
            : undefined,
        resources: [],
        generatedContent: (row.content_kinds ?? []).map((kind) => ({
            id: kind,
            title: kind === "summary" ? "Summary" : "Key terms",
            description: "Saved lecture content",
            href: `/courses/${row.fk_course_id}/lectures/${row.id}/generated-content/${kind}`,
        })),
    };
}

export class PostgresLectureRepository implements LectureRepository {
    private readonly database: Pool;

    constructor(database: Pool) {
        this.database = database;
    }

    async listCourseLectures(courseId: string): Promise<Lecture[]> {
        const rows = await this.query(
            `
            SELECT
                id,
                fk_course_id,
                title,
                description,
                status,
                status_message,
                EXISTS (SELECT 1 FROM lecture_transcripts WHERE lecture_id=lectures.id) AS has_transcript,
                ARRAY(SELECT kind FROM lecture_generated_content WHERE lecture_id=lectures.id ORDER BY kind) AS content_kinds
            FROM lectures
            WHERE fk_course_id = $1
            ORDER BY id
            `,
            [courseId],
        );

        return rows.map((row) => toLecture(row));
    }

    async getLecture(courseId: string, lectureId: string): Promise<Lecture | null> {
        const rows = await this.query(
            `
            SELECT
                id,
                fk_course_id,
                title,
                description,
                status,
                status_message,
                EXISTS (SELECT 1 FROM lecture_transcripts WHERE lecture_id=lectures.id) AS has_transcript,
                ARRAY(SELECT kind FROM lecture_generated_content WHERE lecture_id=lectures.id ORDER BY kind) AS content_kinds
            FROM lectures
            WHERE fk_course_id = $1
                AND id = $2
            `,
            [courseId, lectureId],
        );

        const row = rows[0];

        return row ? toLecture(row) : null;
    }

    async createLecture(input: CreateLectureInput): Promise<Lecture> {
        const rows = await this.query(
            `
            INSERT INTO lectures (
                fk_course_id,
                title,
                description,
                status,
                status_message
            )
            VALUES ($1, $2, $3, 'pending', 'Awaiting recording upload.')
            RETURNING
                id,
                fk_course_id,
                title,
                description,
                status,
                status_message
            `,
            [input.courseId, input.title, input.description],
        );

        const row = rows[0];

        if (!row) {
            throw new Error("Lecture creation returned no record");
        }

        return toLecture(row);
    }

    async updateLecture(courseId: string, lectureId: string, input: UpdateLectureInput): Promise<Lecture | null> {
        const rows = await this.query(
            `
            UPDATE lectures
            SET
                title = COALESCE($3, title),
                description = COALESCE($4, description),
                status = COALESCE($5, status),
                status_message = COALESCE($6, status_message),
                last_updated_at = CURRENT_TIMESTAMP
            WHERE fk_course_id = $1
                AND id = $2
            RETURNING
                id,
                fk_course_id,
                title,
                description,
                status,
                status_message
            `,
            [courseId, lectureId, input.title ?? null, input.description ?? null, input.status ?? null, input.statusMessage ?? null],
        );

        const row = rows[0];

        return row ? toLecture(row) : null;
    }

    private async query(text: string, values: (string | null)[]): Promise<LectureRow[]> {
        try {
            const result = await this.database.query<LectureRow>(text, values);

            return result.rows;
        } catch (error) {
            if (
                error instanceof DatabaseError &&
                (error.code === postgresErrorCodes.invalidTextRepresentation || error.code === postgresErrorCodes.numericValueOutOfRange)
            ) {
                return [];
            }

            throw error;
        }
    }
}
