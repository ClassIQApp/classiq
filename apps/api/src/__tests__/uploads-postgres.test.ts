import { PostgresLectureRepository } from "../core/lecture/postgres-lecture-repository.ts";
import { PostgresUploadRepository } from "../core/uploads/postgres-upload-repository.ts";
import { runMigrations } from "../db/migrate.ts";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testUrl = process.env.TEST_UPLOAD_DATABASE_URL;

describe.skipIf(!testUrl)("Postgres upload persistence", () => {
    const schema = `upload_test_${randomUUID().replaceAll("-", "")}`;
    const db = new Pool({ connectionString: testUrl, options: `-c search_path=${schema}` });
    const repository = new PostgresUploadRepository(db);
    let courseId: string;
    let lectureId: string;
    let otherCourseId: string;

    beforeAll(async () => {
        await db.query(`CREATE SCHEMA ${schema}`);

        await runMigrations(db);

        const courses = await db.query<{ id: number }>(
            "INSERT INTO courses (name, slug) VALUES ('F test', 'f-test'), ('F other', 'f-other') RETURNING id",
        );

        courseId = String(courses.rows[0]!.id);
        otherCourseId = String(courses.rows[1]!.id);

        const lectures = await db.query<{ id: number }>("INSERT INTO lectures (fk_course_id) VALUES ($1) RETURNING id", [courseId]);

        lectureId = String(lectures.rows[0]!.id);
    });

    afterAll(async () => {
        await db.query(`DROP SCHEMA ${schema} CASCADE`);

        await db.end();
    });

    it("keeps migrations immutable and repeatable", async () => {
        expect(await runMigrations(db)).toEqual([]);

        const row = await db.query("SELECT status FROM lectures WHERE id = $1", [lectureId]);

        expect(row.rows[0].status).toBe("pending");
    });

    it("creates lectures awaiting upload rather than pretending processing has started", async () => {
        const lectures = new PostgresLectureRepository(db);

        const lecture = await lectures.createLecture({
            courseId,
            title: "New recording",
            description: "Awaiting its first recording upload.",
        });

        expect(lecture.status).toBe("pending");
        expect(lecture.statusMessage).toBe("Awaiting recording upload.");
    });

    it("serializes competing recording initiation and completion, persisting one asset", async () => {
        const input = { name: "lecture.mp4", contentType: "video/mp4", contentLength: 512, lectureId };

        const [first, second] = await Promise.all([
            repository.initiate("recording", courseId, input),
            repository.initiate("recording", courseId, input),
        ]);

        expect(first).toEqual(second);
        await expect(repository.initiate("recording", courseId, { ...input, contentLength: 100 })).rejects.toMatchObject({ status: 409 });

        await Promise.all([repository.complete(first), repository.complete(second)]);

        const fresh = new PostgresUploadRepository(db);

        expect(await fresh.find(courseId, "recording", lectureId)).toMatchObject({ id: first.id, uploadStatus: "uploaded" });

        const completedLecture = await db.query("SELECT status FROM lectures WHERE id = $1", [lectureId]);
        const recordingCount = await db.query("SELECT COUNT(*)::int AS count FROM upload_assets WHERE kind = 'recording'");

        expect(completedLecture.rows[0].status).toBe("uploaded");
        expect(recordingCount.rows[0].count).toBe(1);

        await db.query("UPDATE lectures SET status = 'processing' WHERE id = $1", [lectureId]);

        await repository.complete(first);

        const processingLecture = await db.query("SELECT status FROM lectures WHERE id = $1", [lectureId]);

        expect(processingLecture.rows[0].status).toBe("processing");
        await expect(repository.initiate("recording", courseId, input)).rejects.toMatchObject({ status: 409 });
    });

    it("persists PDF metadata through the existing repository and isolates parents", async () => {
        const input = { name: "notes.pdf", contentType: "application/pdf", contentLength: 100, lectureId };

        await expect(repository.initiate("resource", otherCourseId, input)).rejects.toMatchObject({ status: 404 });

        const key = randomUUID();

        const [asset, retry] = await Promise.all([
            repository.initiate("resource", courseId, input, key),
            repository.initiate("resource", courseId, input, key),
        ]);

        expect(asset).toEqual(retry);
        await expect(repository.initiate("resource", courseId, { ...input, name: "changed.pdf" }, key)).rejects.toMatchObject({
            status: 409,
        });

        await repository.complete(asset);

        const row = await db.query("SELECT upload_status, fk_lecture_id, content_length FROM course_resources WHERE id = $1", [
            asset.resourceId,
        ]);

        expect(row.rows[0]).toMatchObject({ upload_status: "uploaded", fk_lecture_id: Number(lectureId), content_length: "100" });
        expect(await repository.find(otherCourseId, "resource", asset.resourceId!)).toBeUndefined();
        expect(await repository.find(otherCourseId, "recording", lectureId)).toBeUndefined();
        expect(await new PostgresUploadRepository(db).listResources(courseId)).toContainEqual({ ...asset, uploadStatus: "uploaded" });
        await expect(
            db.query("INSERT INTO course_resources(fk_course_id, fk_lecture_id) VALUES ($1, $2)", [otherCourseId, lectureId]),
        ).rejects.toMatchObject({ code: "23503" });
    });
});
