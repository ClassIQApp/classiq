import { createApp } from "../app.ts";
import type { AuthConfig } from "../core/auth/config.ts";
import { PostgresCourseMembershipFacade } from "../core/course-access/postgres-course-membership-facade.ts";
import { PostgresCourseFacade } from "../core/course/postgres-course-facade.ts";
import type { UploadStorage } from "../core/uploads/model.ts";
import { migrationsDirectory, runMigrations } from "../db/migrate.ts";
import { randomUUID } from "node:crypto";
import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const databaseURL = process.env.AUTH_TEST_DATABASE_URL;

const origin = "http://localhost:5173";

const config: AuthConfig = {
    secret: "classiq-course-access-integration-only-secret",
    baseURL: "http://localhost:3000",
    trustedOrigins: [origin],
    production: false,
};

const courseSchema = z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    description: z.string(),
    role: z.enum(["teacher", "member"]),
    lectures: z.array(z.object({ id: z.string(), status: z.string() })),
});

const lectureSchema = z.object({ id: z.string(), title: z.string(), status: z.string() });

function databaseFixture() {
    const schema = `course_access_test_${randomUUID().replaceAll("-", "")}`;
    const admin = new Pool({ connectionString: databaseURL });
    const db = new Pool({ connectionString: databaseURL, options: `-c search_path=${schema}` });

    beforeAll(async () => {
        await admin.query(`CREATE SCHEMA ${schema}`);
    });

    afterAll(async () => {
        await db.end();

        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);

        await admin.end();
    });

    return db;
}

function storageFixture() {
    return {
        ticket: vi.fn(async () => ({
            uploadId: randomUUID(),
            assetId: randomUUID(),
            url: "https://files.test/put",
            method: "PUT" as const,
            headers: {},
            expiresAt: new Date().toISOString(),
        })),
        verify: vi.fn(async () => {}),
        download: vi.fn(async () => ({ url: "https://files.test/get", expiresAt: new Date().toISOString() })),
        read: vi.fn(async () => new Uint8Array()),
    } satisfies UploadStorage;
}

function client(db: Pool, storage: UploadStorage = storageFixture()) {
    const app = createApp(() => db, { getAuthConfig: () => config, getUploadStorage: () => storage });

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
        const { user } = z.object({ user: z.object({ id: z.string() }) }).parse(await response.json());

        return { id: user.id, cookie };
    }

    function send(cookie: string | undefined, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
        return app.request(url, {
            method,
            headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...headers },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
    }

    return { app, signUp, send };
}

const describeDatabase = describe.skipIf(!databaseURL);

describeDatabase("course membership migration on a database where 007 is already applied", () => {
    const db = databaseFixture();

    it("adds memberships without granting anyone access to legacy courses", async () => {
        const directory = await mkdtemp(path.join(tmpdir(), "classiq-membership-migrations-"));

        try {
            const entries = await readdir(migrationsDirectory);
            const files = entries.filter((file) => file.endsWith(".sql") && file !== "006_course_memberships.sql");

            await Promise.all(files.map((file) => copyFile(path.join(migrationsDirectory, file), path.join(directory, file))));

            expect(await runMigrations(db, directory)).toContain("007_upload_assets.sql");

            await db.query("INSERT INTO users (id, name, email) VALUES (42, 'Legacy', 'legacy@example.com')");
            await db.query("SELECT setval(pg_get_serial_sequence('users', 'id'), 42)");
            await db.query("INSERT INTO courses (id, name, slug) VALUES (1, 'Legacy course', 'legacy')");
            await db.query("SELECT setval(pg_get_serial_sequence('courses', 'id'), 1)");
            await db.query("INSERT INTO lectures (id, fk_course_id) VALUES (1, 1)");

            expect(await runMigrations(db)).toEqual(["006_course_memberships.sql"]);
            expect(await runMigrations(db)).toEqual([]);

            const legacy = await db.query(`
                SELECT users.id AS user_id, courses.name, lectures.id AS lecture_id
                FROM users, courses JOIN lectures ON lectures.fk_course_id = courses.id
            `);
            const memberships = await db.query("SELECT * FROM course_memberships");

            expect(legacy.rows).toEqual([{ user_id: 42, name: "Legacy course", lecture_id: 1 }]);
            expect(memberships.rowCount).toBe(0);

            const { signUp, send } = client(db);
            const user = await signUp("upgrade@example.com");

            const list = await send(user.cookie, "GET", "/courses");
            const course = await send(user.cookie, "GET", "/courses/1");

            expect(await list.json()).toEqual({ items: [] });
            expect(course.status).toBe(404);
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});

describeDatabase("course permissions over HTTP", () => {
    const db = databaseFixture();
    const storage = storageFixture();
    const { app, signUp, send } = client(db, storage);
    const memberships = new PostgresCourseMembershipFacade(db);

    let teacher: Awaited<ReturnType<typeof signUp>>;
    let member: Awaited<ReturnType<typeof signUp>>;
    let outsider: Awaited<ReturnType<typeof signUp>>;
    let courseId: string;
    let otherCourseId: string;
    let lectureId: string;
    let otherLectureId: string;

    beforeAll(async () => {
        expect(await runMigrations(db)).toContain("006_course_memberships.sql");

        teacher = await signUp("teacher@example.com");
        member = await signUp("member@example.com");
        outsider = await signUp("outsider@example.com");

        const created = await send(teacher.cookie, "POST", "/courses", {
            code: "CSI 4500",
            name: "Operating Systems",
            slug: "csi-4500",
            description: "",
        });

        expect(created.status).toBe(201);

        const course = courseSchema.parse(await created.json());

        expect(course).toMatchObject({ code: "CSI 4500", role: "teacher", lectures: [] });

        courseId = course.id;

        const otherCreated = await send(member.cookie, "POST", "/courses", {
            code: "MTH 2775",
            name: "Linear Algebra",
            slug: "mth",
            description: "",
        });

        otherCourseId = courseSchema.parse(await otherCreated.json()).id;

        await memberships.create({ courseId, userId: member.id, role: "member" });
        await memberships.create({ courseId: otherCourseId, userId: teacher.id, role: "member" });

        const lecture = await send(teacher.cookie, "POST", `/courses/${courseId}/lectures`, { title: "Scheduling", description: "CPU" });
        const otherLecture = await send(member.cookie, "POST", `/courses/${otherCourseId}/lectures`, {
            title: "Vectors",
            description: "Bases",
        });

        lectureId = lectureSchema.parse(await lecture.json()).id;
        otherLectureId = lectureSchema.parse(await otherLecture.json()).id;
    });

    it("lists only the account's memberships with a role per course", async () => {
        const teacherCourses = await send(teacher.cookie, "GET", "/courses");
        const outsiderCourses = await send(outsider.cookie, "GET", "/courses");
        const anonymousCourses = await send(undefined, "GET", "/courses");

        const items = z.object({ items: z.array(courseSchema) }).parse(await teacherCourses.json()).items;

        expect(items.map((course) => [course.id, course.role])).toEqual([
            [courseId, "teacher"],
            [otherCourseId, "member"],
        ]);
        expect(items[0]?.lectures.map((lecture) => lecture.id)).toEqual([lectureId]);
        expect(await outsiderCourses.json()).toEqual({ items: [] });
        expect(anonymousCourses.status).toBe(401);
    });

    it.each([
        ["GET", "", undefined, { teacher: 200, member: 200 }],
        ["PATCH", "", { description: "Processes and memory." }, { teacher: 200, member: 403 }],
        ["GET", "/lectures", undefined, { teacher: 200, member: 200 }],
        ["POST", "/lectures", { title: "Paging", description: "Page tables" }, { teacher: 201, member: 403 }],
        ["PATCH", "/lectures/:lectureId", { title: "CPU scheduling" }, { teacher: 200, member: 403 }],
        [
            "POST",
            "/lectures/:lectureId/recording/upload",
            { name: "a.webm", contentType: "audio/webm", contentLength: 10 },
            { teacher: 201, member: 403 },
        ],
        ["GET", "/lectures/:lectureId/recording", undefined, { teacher: 200, member: 200 }],
        [
            "POST",
            "/resources/upload",
            { name: "notes.pdf", contentType: "application/pdf", contentLength: 10 },
            { teacher: 201, member: 403 },
        ],
        ["GET", "/resources", undefined, { teacher: 200, member: 200 }],
    ])("%s course%s enforces membership", async (method, suffix, body, statusByRole) => {
        const url = `/courses/${courseId}${suffix.replace(":lectureId", lectureId)}`;

        const anonymousResponse = await send(undefined, method, url, body);
        const outsiderResponse = await send(outsider.cookie, method, url, body);
        const memberResponse = await send(member.cookie, method, url, body);
        const teacherResponse = await send(teacher.cookie, method, url, body);

        expect(anonymousResponse.status).toBe(401);
        expect(outsiderResponse.status).toBe(404);
        expect(await outsiderResponse.json()).toMatchObject({ code: "COURSE_NOT_FOUND" });
        expect(memberResponse.status).toBe(statusByRole.member);
        expect(teacherResponse.status).toBe(statusByRole.teacher);

        if (statusByRole.member === 403) {
            expect(await memberResponse.json()).toMatchObject({ code: "FORBIDDEN" });
        }
    });

    it("returns the caller's role for the requested course", async () => {
        const asTeacher = await send(teacher.cookie, "GET", `/courses/${courseId}`);
        const asMember = await send(teacher.cookie, "GET", `/courses/${otherCourseId}`);

        expect(courseSchema.parse(await asTeacher.json()).role).toBe("teacher");
        expect(courseSchema.parse(await asMember.json()).role).toBe("member");
    });

    it("does not let request bodies forge membership", async () => {
        const forgedCreation = await send(outsider.cookie, "POST", "/courses", {
            code: "X",
            name: "Forged",
            slug: "forged",
            description: "",
            role: "member",
            userId: teacher.id,
        });
        const forgedUpdate = await send(member.cookie, "PATCH", `/courses/${courseId}`, { role: "teacher" });
        const forgedSettings = await send(teacher.cookie, "PATCH", `/courses/${courseId}`, { role: "member", userId: member.id });

        expect(forgedCreation.status).toBe(400);
        expect(forgedUpdate.status).toBe(403);
        expect(forgedSettings.status).toBe(400);
        expect(await memberships.fetchRole(courseId, teacher.id)).toBe("teacher");
        expect(await memberships.fetchRole(courseId, member.id)).toBe("member");
        expect(await memberships.fetchRole(courseId, outsider.id)).toBeUndefined();
    });

    it("isolates lectures and uploads to their parent course", async () => {
        const mismatchedRequests = [
            [teacher, "PATCH", `/courses/${courseId}/lectures/${otherLectureId}`, { title: "Hijacked" }],
            [member, "PATCH", `/courses/${otherCourseId}/lectures/${lectureId}`, { title: "Hijacked" }],
            [teacher, "PATCH", `/courses/${courseId}/lectures/not-a-lecture`, { title: "Hijacked" }],
            [
                teacher,
                "POST",
                `/courses/${courseId}/lectures/${otherLectureId}/recording/upload`,
                { name: "a.webm", contentType: "audio/webm", contentLength: 10 },
            ],
            [teacher, "GET", `/courses/${courseId}/lectures/${otherLectureId}/recording`, undefined],
            [teacher, "GET", "/courses/not-a-course", undefined],
            [teacher, "GET", "/courses/2147483648/lectures", undefined],
        ] as const;

        for (const [user, method, url, body] of mismatchedRequests) {
            const response = await send(user.cookie, method, url, body);

            expect(response.status).toBe(404);
        }

        const lectures = await db.query("SELECT title FROM lectures WHERE id = ANY($1::int[]) ORDER BY id", [[lectureId, otherLectureId]]);

        expect(lectures.rows.map((row) => row.title)).toEqual(["CPU scheduling", "Vectors"]);
    });

    it("lets members download completed files while unrelated accounts cannot", async () => {
        const uploads = await db.query<{ upload_id: string }>("SELECT upload_id FROM upload_assets WHERE lecture_id = $1", [lectureId]);
        const uploadId = uploads.rows[0]?.upload_id;
        const url = `/courses/${courseId}/lectures/${lectureId}/recording`;

        const memberCompletion = await send(member.cookie, "POST", `${url}/complete`, { uploadId });
        const completion = await send(teacher.cookie, "POST", `${url}/complete`, { uploadId });
        const memberDownload = await send(member.cookie, "GET", `${url}/download`);
        const outsiderDownload = await send(outsider.cookie, "GET", `${url}/download`);

        expect(memberCompletion.status).toBe(403);
        expect(completion.status).toBe(200);
        expect(memberDownload.status).toBe(200);
        expect(outsiderDownload.status).toBe(404);
        expect(storage.download).toHaveBeenCalledTimes(1);
    });

    it("permits the upload retry header in credentialed preflight", async () => {
        const response = await app.request(`/courses/${courseId}/resources/upload`, {
            method: "OPTIONS",
            headers: {
                Origin: origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,idempotency-key",
            },
        });

        expect(response.status).toBe(204);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
        expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Idempotency-Key");
    });

    it("rolls back course creation when the Teacher membership cannot be stored", async () => {
        const courses = new PostgresCourseFacade(db);
        const registration = { code: "X", name: "Orphan", slug: "orphan", description: "" };

        await expect(courses.register(registration, { userId: "2147483647", role: "teacher" })).rejects.toMatchObject({
            code: "provider_error",
        });

        const orphan = await db.query("SELECT id FROM courses WHERE slug = 'orphan'");
        const duplicate = await send(outsider.cookie, "POST", "/courses", { ...registration, slug: "csi-4500" });
        const outsiderCourses = await send(outsider.cookie, "GET", "/courses");

        expect(orphan.rowCount).toBe(0);
        expect(duplicate.status).toBe(409);
        expect(await outsiderCourses.json()).toEqual({ items: [] });
    });
});
