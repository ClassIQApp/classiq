import type { CreateLectureInput, LectureRepository, UpdateLectureInput } from "./lecture-repository.ts";
import type { Lecture } from "./model.ts";
import type { Pool } from "pg";

interface LectureRow {
    id: number;
    fk_course_id: number;
    title: string;
    description: string;
    status: Lecture["status"];
    status_message: string;
}

function toLecture(row: LectureRow): Lecture {
    return {
        id: String(row.id),
        title: row.title,
        description: row.description,
        status: row.status,
        statusMessage: row.status_message,
        transcript: undefined,
        resources: [],
        generatedContent: [],
    };
}

export class PostgresLectureRepository implements LectureRepository {
    private readonly database: Pool;

    constructor(database: Pool) {
        this.database = database;
    }

    async listCourseLectures(courseId: string): Promise<Lecture[]> {
        const result = await this.database.query<LectureRow>(
            `
            SELECT
                id,
                fk_course_id,
                title,
                description,
                status,
                status_message
            FROM lectures
            WHERE fk_course_id = $1
            ORDER BY id
            `,
            [courseId],
        );

        return result.rows.map((row) => toLecture(row));
    }

    async getLecture(lectureId: string): Promise<Lecture | null> {
        const result = await this.database.query<LectureRow>(
            `
            SELECT
                id,
                fk_course_id,
                title,
                description,
                status,
                status_message
            FROM lectures
            WHERE id = $1
            `,
            [lectureId],
        );

        const row = result.rows[0];

        return row ? toLecture(row) : null;
    }

    async createLecture(input: CreateLectureInput): Promise<Lecture> {
        const result = await this.database.query<LectureRow>(
            `
            INSERT INTO lectures (
                fk_course_id,
                title,
                description,
                status,
                status_message
            )
            VALUES ($1, $2, $3, 'processing', '')
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

        const row = result.rows[0];

        if (!row) {
            throw new Error("Lecture creation returned no record");
        }

        return toLecture(row);
    }

    async updateLecture(lectureId: string, input: UpdateLectureInput): Promise<Lecture | null> {
        const result = await this.database.query<LectureRow>(
            `
            UPDATE lectures
            SET
                title = COALESCE($2, title),
                description = COALESCE($3, description),
                status = COALESCE($4, status),
                status_message = COALESCE($5, status_message),
                last_updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING
                id,
                fk_course_id,
                title,
                description,
                status,
                status_message
            `,
            [lectureId, input.title ?? null, input.description ?? null, input.status ?? null, input.statusMessage ?? null],
        );

        const row = result.rows[0];

        return row ? toLecture(row) : null;
    }
}
