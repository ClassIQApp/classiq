import { createApp } from "../app.ts";
import type { AuthConfig } from "../core/auth/config.ts";
import { ContentIndexService } from "../core/content-index/content-index-service.ts";
import { PostgresContentIndexRepository } from "../core/content-index/postgres-content-index-repository.ts";
import { PostgresCourseMembershipFacade } from "../core/course-access/postgres-course-membership-facade.ts";
import { runMigrations } from "../db/migrate.ts";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

const databaseURL = process.env.AUTH_TEST_DATABASE_URL;

const origin = "http://localhost:5173";

const config: AuthConfig = {
    secret: "classiq-content-search-integration-only-secret",
    baseURL: "http://localhost:3000",
    trustedOrigins: [origin],
    production: false,
};

const idSchema = z.object({ id: z.string() });

const searchSchema = z.object({
    items: z.array(
        z.object({
            kind: z.enum(["transcript", "resource"]),
            courseId: z.string(),
            lectureId: z.string().optional(),
            resourceId: z.string().optional(),
            title: z.string(),
            content: z.string(),
            pageNumber: z.number().optional(),
            score: z.number(),
        }),
    ),
});

describe.skipIf(!databaseURL)("course-wide content search over HTTP", () => {
    const schema = `content_search_test_${randomUUID().replaceAll("-", "")}`;
    const admin = new Pool({ connectionString: databaseURL });
    const db = new Pool({ connectionString: databaseURL, options: `-c search_path=${schema}` });
    const app = createApp(() => db, { getAuthConfig: () => config });
    const index = new ContentIndexService(new PostgresContentIndexRepository(db));

    let teacher: string;
    let member: string;
    let outsider: string;
    let courseId: string;
    let otherCourseId: string;
    let lectureId: string;
    let otherLectureId: string;
    let resourceId: string;

    async function signUp(email: string) {
        const response = await app.request("/api/auth/sign-up/email", {
            method: "POST",
            headers: { "Content-Type": "application/json", Origin: origin },
            body: JSON.stringify({ name: email, email, password: "correct-password-123" }),
        });

        expect(response.status).toBe(200);

        const cookie = response.headers
            .getSetCookie()
            .map((value) => value.split(";")[0])
            .join("; ");
        const { user } = z.object({ user: idSchema }).parse(await response.json());

        return { id: user.id, cookie };
    }

    function send(cookie: string | undefined, method: string, url: string, body?: unknown) {
        return app.request(url, {
            method,
            headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
    }

    async function create(cookie: string, url: string, body: unknown) {
        const response = await send(cookie, "POST", url, body);

        expect(response.status).toBe(201);

        return idSchema.parse(await response.json()).id;
    }

    function search(cookie: string | undefined, query: string, course = courseId) {
        return send(cookie, "GET", `/courses/${course}/search?${query}`);
    }

    beforeAll(async () => {
        await admin.query(`CREATE SCHEMA ${schema}`);

        await runMigrations(db);

        const teacherAccount = await signUp("search-teacher@example.com");
        const memberAccount = await signUp("search-member@example.com");
        const outsiderAccount = await signUp("search-outsider@example.com");

        teacher = teacherAccount.cookie;
        member = memberAccount.cookie;
        outsider = outsiderAccount.cookie;

        courseId = await create(teacher, "/courses", { code: "BIO 1010", name: "Biology", slug: "bio-1010", description: "" });
        otherCourseId = await create(outsider, "/courses", { code: "CHM 1010", name: "Chemistry", slug: "chm-1010", description: "" });
        lectureId = await create(teacher, `/courses/${courseId}/lectures`, { title: "Enzymes", description: "Catalysis" });
        otherLectureId = await create(outsider, `/courses/${otherCourseId}/lectures`, { title: "Catalysis", description: "Rates" });

        await new PostgresCourseMembershipFacade(db).create({ courseId, userId: memberAccount.id, role: "member" });

        const resources = await db.query<{ id: number }>(
            "INSERT INTO course_resources (fk_course_id, fk_lecture_id, name) VALUES ($1, $2, 'enzyme-notes.pdf'), ($3, $4, 'catalysts.pdf') RETURNING id",
            [courseId, lectureId, otherCourseId, otherLectureId],
        );

        resourceId = String(resources.rows[0]!.id);

        await index.indexSource({ kind: "resource", courseId, resourceId }, [
            { pageNumber: 3, text: "Enzymes are biological catalysts that lower activation energy." },
        ]);
        await index.indexSource({ kind: "resource", courseId: otherCourseId, resourceId: String(resources.rows[1]!.id) }, [
            { pageNumber: 1, text: "Industrial catalysts speed up reactions." },
        ]);
    });

    afterAll(async () => {
        await db.end();

        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);

        await admin.end();
    });

    it("returns ranked passages from the course to its Members", async () => {
        const response = await search(member, "q=catalysts");

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(searchSchema.parse(await response.json()).items).toEqual([
            expect.objectContaining({
                kind: "resource",
                courseId,
                lectureId,
                resourceId,
                title: "enzyme-notes.pdf",
                pageNumber: 3,
                content: expect.stringContaining("biological catalysts"),
            }),
        ]);
    });

    it("filters by lecture and kind within the course", async () => {
        const byLecture = await search(member, `q=catalysts&lectureId=${lectureId}&kind=resource`);
        const byTranscript = await search(member, "q=catalysts&kind=transcript");

        expect(searchSchema.parse(await byLecture.json()).items).toHaveLength(1);
        expect(await byTranscript.json()).toEqual({ items: [] });
    });

    it("returns nothing for a lecture from another course", async () => {
        const response = await search(member, `q=catalysts&lectureId=${otherLectureId}`);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [] });
    });

    it("denies anonymous and unrelated accounts", async () => {
        const anonymous = await search(undefined, "q=catalysts");
        const unrelated = await search(outsider, "q=catalysts");

        expect(anonymous.status).toBe(401);
        expect(unrelated.status).toBe(404);
        expect(await unrelated.json()).toMatchObject({ code: "COURSE_NOT_FOUND" });
    });

    it("does not leak other courses' passages to their non-members", async () => {
        const response = await search(member, "q=industrial", otherCourseId);

        expect(response.status).toBe(404);
    });

    it.each(["", "q=%20", "q=catalysts&kind=video", "q=catalysts&limit=0", "q=catalysts&limit=21", "q=catalysts&lectureId=abc"])(
        "rejects invalid query %j",
        async (query) => {
            const response = await search(member, query);

            expect(response.status).toBe(400);
            expect(await response.json()).toMatchObject({ code: "INVALID_SEARCH" });
        },
    );
});
