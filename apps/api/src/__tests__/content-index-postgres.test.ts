import { ContentIndexService } from "../core/content-index/content-index-service.ts";
import { ContentIndexError } from "../core/content-index/errors.ts";
import type { ContentSourceReference } from "../core/content-index/model.ts";
import { PostgresContentIndexRepository } from "../core/content-index/postgres-content-index-repository.ts";
import { runMigrations } from "../db/migrate.ts";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testUrl = process.env.TEST_UPLOAD_DATABASE_URL;

describe.skipIf(!testUrl)("Postgres content index", () => {
    const schema = `content_index_test_${randomUUID().replaceAll("-", "")}`;
    const db = new Pool({ connectionString: testUrl, options: `-c search_path=${schema}` });
    const service = new ContentIndexService(new PostgresContentIndexRepository(db));
    let courseId: string;
    let otherCourseId: string;
    let lectureId: string;
    let otherLectureId: string;
    let resourceId: string;

    beforeAll(async () => {
        await db.query(`CREATE SCHEMA ${schema}`);

        await runMigrations(db);

        const courses = await db.query<{ id: number }>(
            "INSERT INTO courses (name, slug) VALUES ('Biology', 'bio'), ('Chemistry', 'chem') RETURNING id",
        );

        courseId = String(courses.rows[0]!.id);
        otherCourseId = String(courses.rows[1]!.id);

        const lectures = await db.query<{ id: number }>(
            "INSERT INTO lectures (fk_course_id, title) VALUES ($1, 'Enzymes'), ($1, 'Genetics'), ($2, 'Catalysis') RETURNING id",
            [courseId, otherCourseId],
        );

        lectureId = String(lectures.rows[0]!.id);
        otherLectureId = String(lectures.rows[2]!.id);

        const resources = await db.query<{ id: number }>(
            "INSERT INTO course_resources (fk_course_id, fk_lecture_id, name) VALUES ($1, $2, 'enzyme-notes.pdf') RETURNING id",
            [courseId, lectureId],
        );

        resourceId = String(resources.rows[0]!.id);
    });

    afterAll(async () => {
        await db.query(`DROP SCHEMA ${schema} CASCADE`);

        await db.end();
    });

    const transcript = (): ContentSourceReference => ({ kind: "transcript", courseId, lectureId });
    const resource = (): ContentSourceReference => ({ kind: "resource", courseId, resourceId });

    it("indexes and retrieves transcript passages with their timestamps", async () => {
        const source = await service.indexSource(transcript(), [
            { startSeconds: 0, endSeconds: 10, text: "Enzymes are biological catalysts that lower activation energy." },
        ]);

        expect(source).toMatchObject({ status: "indexed", chunkCount: 1, reference: transcript() });
        expect(source.indexedAt).toBeDefined();

        const results = await service.search({ courseId, text: "catalyst" });

        expect(results).toEqual([
            expect.objectContaining({
                kind: "transcript",
                courseId,
                lectureId,
                title: "Enzymes",
                startSeconds: 0,
                endSeconds: 10,
                content: expect.stringContaining("biological catalysts"),
            }),
        ]);
        expect(results[0]!.score).toBeGreaterThan(0);
    });

    it("retrieves resource passages with their page and owning lecture", async () => {
        await service.indexSource(resource(), [
            { pageNumber: 1, text: "Table of contents." },
            { pageNumber: 4, text: "Competitive inhibitors bind the enzyme active site." },
        ]);

        const results = await service.search({ courseId, text: "inhibitors active site", kinds: ["resource"] });

        expect(results).toEqual([
            expect.objectContaining({ kind: "resource", resourceId, lectureId, title: "enzyme-notes.pdf", pageNumber: 4 }),
        ]);
        expect(results[0]).not.toHaveProperty("startSeconds");
    });

    it("ranks more relevant passages first and filters by lecture", async () => {
        const results = await service.search({ courseId, text: "enzyme", lectureId });

        expect(results.map((result) => result.kind).toSorted()).toEqual(["resource", "transcript"]);
        expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score);
        expect(await service.search({ courseId, text: "enzyme", lectureId: String(Number(lectureId) + 1) })).toEqual([]);
    });

    it("replaces old chunks when a source is re-indexed", async () => {
        await service.indexSource(transcript(), [{ startSeconds: 0, endSeconds: 5, text: "Today we cover allosteric regulation." }]);

        expect(await service.search({ courseId, text: "catalyst" })).toEqual([]);
        expect(await service.search({ courseId, text: "allosteric" })).toHaveLength(1);
    });

    it("never returns another course's content", async () => {
        await service.indexSource({ kind: "transcript", courseId: otherCourseId, lectureId: otherLectureId }, [
            { startSeconds: 0, endSeconds: 5, text: "Allosteric catalysis in industrial chemistry." },
        ]);

        const results = await service.search({ courseId, text: "allosteric" });

        expect(results.map((result) => result.courseId)).toEqual([courseId]);
    });

    it("rejects a lecture from another course without touching that course's index", async () => {
        const foreign: ContentSourceReference = { kind: "transcript", courseId, lectureId: otherLectureId };
        const attempts = [
            () => service.indexSource(foreign, [{ startSeconds: 0, endSeconds: 1, text: "Wrong course." }]),
            () => service.markFailed(foreign, "Hijacked"),
            () =>
                service.indexSource({ kind: "resource", courseId: otherCourseId, resourceId }, [{ pageNumber: 1, text: "Wrong course." }]),
        ];

        for (const attempt of attempts) {
            const error = await attempt().catch((error: unknown) => error);

            expect(error).toBeInstanceOf(ContentIndexError);
            expect((error as ContentIndexError).code).toBe("not_found");
        }

        const untouched = await service.search({ courseId: otherCourseId, text: "catalysis" });

        expect(untouched).toHaveLength(1);
    });

    it("hides failed sources from retrieval and recovers on re-index", async () => {
        const failed = await service.markFailed(resource(), "The PDF has no extractable text.");

        expect(failed).toMatchObject({ status: "failed", statusMessage: "The PDF has no extractable text.", chunkCount: 0 });
        expect(await service.search({ courseId, text: "inhibitors" })).toEqual([]);

        const recovered = await service.indexSource(resource(), [{ pageNumber: 2, text: "Competitive inhibitors return." }]);

        expect(recovered).toMatchObject({ status: "indexed", statusMessage: "", chunkCount: 1 });
        expect(await service.search({ courseId, text: "inhibitors" })).toHaveLength(1);
    });

    it("tolerates search syntax and stopword-only queries", async () => {
        expect(await service.search({ courseId, text: '"allosteric regulation" -industrial or ) (' })).toHaveLength(1);
        expect(await service.search({ courseId, text: "the and of" })).toEqual([]);
    });

    it("removes the index when its lecture is deleted", async () => {
        await db.query("DELETE FROM lectures WHERE id = $1", [lectureId]);

        expect(await service.search({ courseId, text: "allosteric" })).toEqual([]);
        expect(await db.query("SELECT 1 FROM content_sources WHERE course_id = $1", [courseId])).toMatchObject({ rowCount: 0 });
    });
});
