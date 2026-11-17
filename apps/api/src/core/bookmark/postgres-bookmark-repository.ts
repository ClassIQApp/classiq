import type { BookmarkRepository } from "./bookmark-repository.ts";
import type { Bookmark, NewBookmark } from "./model.ts";
import type { Pool } from "pg";

const BOOKMARK_COLUMNS = "id, course_id, lecture_id, start_seconds, note, created_at";

interface BookmarkRow {
    id: number;
    course_id: number;
    lecture_id: number;
    start_seconds: number;
    note: string;
    created_at: Date;
}

function toBookmark(row: BookmarkRow): Bookmark {
    return {
        id: String(row.id),
        courseId: String(row.course_id),
        lectureId: String(row.lecture_id),
        startSeconds: row.start_seconds,
        note: row.note,
        createdAt: row.created_at.toISOString(),
    };
}

export class PostgresBookmarkRepository implements BookmarkRepository {
    private readonly pool: Pool;

    constructor(pool: Pool) {
        this.pool = pool;
    }

    async lectureExists(courseId: string, lectureId: string): Promise<boolean> {
        const result = await this.pool.query("SELECT 1 FROM lectures WHERE fk_course_id = $1 AND id = $2", [courseId, lectureId]);

        return result.rowCount === 1;
    }

    async listBookmarks(courseId: string, lectureId: string, userId: string): Promise<Bookmark[]> {
        const result = await this.pool.query<BookmarkRow>(
            `SELECT ${BOOKMARK_COLUMNS} FROM lecture_bookmarks
             WHERE course_id = $1 AND lecture_id = $2 AND user_id = $3
             ORDER BY start_seconds, id`,
            [courseId, lectureId, userId],
        );

        return result.rows.map((row) => toBookmark(row));
    }

    async insertBookmark(bookmark: NewBookmark, userId: string): Promise<Bookmark> {
        const result = await this.pool.query<BookmarkRow>(
            `INSERT INTO lecture_bookmarks (course_id, lecture_id, user_id, start_seconds, note)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING ${BOOKMARK_COLUMNS}`,
            [bookmark.courseId, bookmark.lectureId, userId, bookmark.startSeconds, bookmark.note],
        );

        return toBookmark(result.rows[0]!);
    }

    async updateNote(courseId: string, lectureId: string, bookmarkId: string, userId: string, note: string): Promise<Bookmark | undefined> {
        const result = await this.pool.query<BookmarkRow>(
            `UPDATE lecture_bookmarks SET note = $5
             WHERE course_id = $1 AND lecture_id = $2 AND id = $3 AND user_id = $4
             RETURNING ${BOOKMARK_COLUMNS}`,
            [courseId, lectureId, bookmarkId, userId, note],
        );

        return result.rows[0] ? toBookmark(result.rows[0]) : undefined;
    }

    async deleteBookmark(courseId: string, lectureId: string, bookmarkId: string, userId: string): Promise<boolean> {
        const result = await this.pool.query(
            "DELETE FROM lecture_bookmarks WHERE course_id = $1 AND lecture_id = $2 AND id = $3 AND user_id = $4",
            [courseId, lectureId, bookmarkId, userId],
        );

        return result.rowCount === 1;
    }
}
