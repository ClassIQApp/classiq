import { StudyGuideError } from "./errors.ts";
import type { StudyGuide, StudyGuideDraft, StudyGuideSection, StudyGuideSource, StudyGuideSummary } from "./model.ts";
import type { StudyGuideRepository } from "./study-guide-repository.ts";
import { DatabaseError, type Pool, type PoolClient } from "pg";

const STUDY_GUIDE_COLUMNS = `
    study_guides.id,
    study_guides.course_id,
    study_guides.lecture_id,
    study_guides.title,
    study_guides.overview,
    study_guides.overview_sources,
    study_guides.created_at,
    (
        SELECT count(*)
        FROM study_guide_sections
        WHERE study_guide_sections.study_guide_id = study_guides.id
    ) AS section_count
`;

interface StudyGuideRow {
    id: number;
    course_id: number;
    lecture_id: number | null;
    title: string;
    overview: string;
    overview_sources: StudyGuideSource[];
    created_at: Date;
    section_count: string;
}

interface StudyGuideSectionRow {
    id: number;
    position: number;
    heading: string;
    content: string;
    key_points: string[];
    sources: StudyGuideSource[];
}

function toSummary(row: StudyGuideRow): StudyGuideSummary {
    return {
        id: String(row.id),
        courseId: String(row.course_id),
        ...(row.lecture_id === null ? {} : { lectureId: String(row.lecture_id) }),
        title: row.title,
        sectionCount: Number(row.section_count),
        createdAt: row.created_at.toISOString(),
    };
}

function toSection(row: StudyGuideSectionRow): StudyGuideSection {
    return {
        id: String(row.id),
        position: row.position,
        heading: row.heading,
        content: row.content,
        keyPoints: row.key_points,
        sources: row.sources,
    };
}

function isForeignKeyViolation(error: unknown): boolean {
    return error instanceof DatabaseError && error.code === "23503";
}

export class PostgresStudyGuideRepository implements StudyGuideRepository {
    private readonly db: Pool;

    constructor(db: Pool) {
        this.db = db;
    }

    async scopeExists(courseId: string, lectureId?: string): Promise<boolean> {
        const result =
            lectureId === undefined
                ? await this.db.query("SELECT 1 FROM courses WHERE id = $1", [courseId])
                : await this.db.query(
                      `
                      SELECT 1
                      FROM lectures
                      WHERE fk_course_id = $1
                          AND id = $2
                      `,
                      [courseId, lectureId],
                  );

        return Boolean(result.rowCount);
    }

    async createStudyGuide(draft: StudyGuideDraft): Promise<StudyGuide> {
        return this.transaction(async (client) => {
            let studyGuideId: number;

            try {
                const result = await client.query<{ id: number }>(
                    `
                    INSERT INTO study_guides (
                        course_id,
                        lecture_id,
                        title,
                        overview,
                        overview_sources,
                        model,
                        created_by_user_id
                    )
                    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
                    RETURNING id
                    `,
                    [
                        draft.courseId,
                        draft.lectureId ?? null,
                        draft.title,
                        draft.overview,
                        JSON.stringify(draft.overviewSources),
                        draft.model,
                        draft.createdByUserId ?? null,
                    ],
                );

                studyGuideId = result.rows[0]!.id;
            } catch (error) {
                if (isForeignKeyViolation(error)) {
                    throw new StudyGuideError("not_found");
                }

                throw error;
            }

            await client.query(
                `
                INSERT INTO study_guide_sections (
                    study_guide_id,
                    position,
                    heading,
                    content,
                    key_points,
                    sources
                )
                SELECT
                    $1,
                    section.position,
                    section.heading,
                    section.content,
                    ARRAY(
                        SELECT jsonb_array_elements_text(section.key_points)
                    ),
                    section.sources
                FROM jsonb_to_recordset($2::jsonb)
                    AS section(
                        position int,
                        heading text,
                        content text,
                        key_points jsonb,
                        sources jsonb
                    )
                `,
                [
                    studyGuideId,
                    JSON.stringify(
                        draft.sections.map((section, position) => ({
                            position,
                            heading: section.heading,
                            content: section.content,
                            key_points: section.keyPoints,
                            sources: section.sources,
                        })),
                    ),
                ],
            );

            return (await this.readStudyGuide(client, draft.courseId, String(studyGuideId)))!;
        });
    }

    async listStudyGuides(courseId: string, lectureId?: string): Promise<StudyGuideSummary[]> {
        const result = await this.db.query<StudyGuideRow>(
            `
            SELECT ${STUDY_GUIDE_COLUMNS}
            FROM study_guides
            WHERE course_id = $1
                AND ($2::int IS NULL OR lecture_id = $2)
            ORDER BY created_at DESC, id DESC
            `,
            [courseId, lectureId ?? null],
        );

        return result.rows.map((row) => toSummary(row));
    }

    async getStudyGuide(courseId: string, studyGuideId: string): Promise<StudyGuide | undefined> {
        const client = await this.db.connect();

        try {
            return await this.readStudyGuide(client, courseId, studyGuideId);
        } finally {
            client.release();
        }
    }

    private async readStudyGuide(client: PoolClient, courseId: string, studyGuideId: string): Promise<StudyGuide | undefined> {
        const guides = await client.query<StudyGuideRow>(
            `
            SELECT ${STUDY_GUIDE_COLUMNS}
            FROM study_guides
            WHERE course_id = $1
                AND id = $2
            `,
            [courseId, studyGuideId],
        );

        const row = guides.rows[0];

        if (!row) {
            return undefined;
        }

        const sections = await client.query<StudyGuideSectionRow>(
            `
            SELECT
                id,
                position,
                heading,
                content,
                key_points,
                sources
            FROM study_guide_sections
            WHERE study_guide_id = $1
            ORDER BY position
            `,
            [row.id],
        );

        return {
            ...toSummary(row),
            overview: row.overview,
            overviewSources: row.overview_sources,
            sections: sections.rows.map((section) => toSection(section)),
        };
    }

    private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
        const client = await this.db.connect();

        try {
            await client.query("BEGIN");

            const result = await operation(client);

            await client.query("COMMIT");

            return result;
        } catch (error) {
            await client.query("ROLLBACK");

            throw error;
        } finally {
            client.release();
        }
    }
}
