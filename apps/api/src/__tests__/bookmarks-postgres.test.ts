import { PostgresBookmarkRepository } from "../core/bookmark/postgres-bookmark-repository.ts";
import { runMigrations } from "../db/migrate.ts";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testUrl = process.env.TEST_UPLOAD_DATABASE_URL;

describe.skipIf(!testUrl)("Postgres bookmark persistence", () => {
    const schema = `bookmark_test_${randomUUID().replaceAll("-", "")}`;
    const db = new Pool({ connectionString: testUrl, options: `-c search_path=${schema}` });
    const repository = new PostgresBookmarkRepository(db);
    let courseId: string;
    let lectureId: string;
    let userId: string;
    let otherUserId: string;

    beforeAll(async () => {
        await db.query(`CREATE SCHEMA ${schema}`);
        await runMigrations(db);

        const course = await db.query<{ id: number }>(
            "INSERT INTO courses (name, slug) VALUES ('Bookmark biology', 'bookmark-bio') RETURNING id",
        );

        courseId = String(course.rows[0]!.id);

        const lecture = await db.query<{ id: number }>("INSERT INTO lectures (fk_course_id, title) VALUES ($1, 'Enzymes') RETURNING id", [
            courseId,
        ]);

        lectureId = String(lecture.rows[0]!.id);

        const users = await db.query<{ id: number }>(
            "INSERT INTO users (name, email) VALUES ('Student', 'bookmark-student@test.dev'), ('Other', 'bookmark-other@test.dev') RETURNING id",
        );

        userId = String(users.rows[0]!.id);
        otherUserId = String(users.rows[1]!.id);
    });

    afterAll(async () => {
        await db.query(`DROP SCHEMA ${schema} CASCADE`);
        await db.end();
    });

    it("orders a user's bookmarks by playhead and hides them from other users", async () => {
        const late = await repository.insertBookmark({ courseId, lectureId, startSeconds: 120, note: "" }, userId);

        await repository.insertBookmark({ courseId, lectureId, startSeconds: 30.5, note: "intro" }, userId);

        const own = await repository.listBookmarks(courseId, lectureId, userId);

        expect(own.map((bookmark) => bookmark.startSeconds)).toEqual([30.5, 120]);
        expect(await repository.listBookmarks(courseId, lectureId, otherUserId)).toEqual([]);
        expect(await repository.updateNote(courseId, lectureId, late.id, otherUserId, "hijack")).toBeUndefined();
        expect(await repository.deleteBookmark(courseId, lectureId, late.id, otherUserId)).toBe(false);
        expect(await repository.updateNote(courseId, lectureId, late.id, userId, "mine")).toMatchObject({ note: "mine" });
        expect(await repository.deleteBookmark(courseId, lectureId, late.id, userId)).toBe(true);
    });

    it("removes bookmarks when their lecture is deleted", async () => {
        await repository.insertBookmark({ courseId, lectureId, startSeconds: 5, note: "" }, userId);
        await db.query("DELETE FROM lectures WHERE id = $1", [lectureId]);

        expect(await repository.listBookmarks(courseId, lectureId, userId)).toEqual([]);
    });
});
