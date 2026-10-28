import { createApp } from "../app.ts";
import type { AuthConfig } from "../core/auth/config.ts";
import type { CourseRole } from "../core/course-access/model.ts";
import { runMigrations } from "../db/migrate.ts";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

const databaseURL = process.env.AUTH_TEST_DATABASE_URL;

const origin = "http://localhost:5173";

const config: AuthConfig = {
    secret: "classiq-invitation-integration-only-secret-123",
    baseURL: "http://localhost:3000",
    trustedOrigins: [origin],
    production: false,
};

const invitationSchema = z.strictObject({
    id: z.string(),
    courseId: z.string(),
    courseName: z.string(),
    email: z.string(),
    status: z.enum(["pending", "accepted"]),
    createdAt: z.iso.datetime(),
});

interface Account {
    id: string;
    email: string;
    cookie: string;
}

describe.skipIf(!databaseURL)("course invitations with real sessions and PostgreSQL", () => {
    const schema = `invitation_test_${randomUUID().replaceAll("-", "")}`;
    const admin = new Pool({ connectionString: databaseURL });
    const db = new Pool({ connectionString: databaseURL, options: `-c search_path=${schema}` });

    const app = createApp(() => db, { getAuthConfig: () => config });

    let teacher: Account;
    let student: Account;
    let outsider: Account;
    let colleague: Account;
    let courseId: string;

    async function register(email: string): Promise<Account> {
        const response = await app.request("/api/auth/sign-up/email", {
            method: "POST",
            headers: { "Content-Type": "application/json", Origin: origin },
            body: JSON.stringify({ name: "Invitation Tester", email, password: "correct-password-123" }),
        });

        expect(response.status).toBe(200);

        const { user } = z.object({ user: z.object({ id: z.string() }) }).parse(await response.json());
        const cookie = response.headers
            .getSetCookie()
            .map((value) => value.split(";")[0])
            .join("; ");

        return { id: user.id, email, cookie };
    }

    function send(path: string, account?: Account, body?: unknown) {
        const headers: Record<string, string> = { Origin: origin, "Content-Type": "application/json" };

        if (account) {
            headers.Cookie = account.cookie;
        }

        if (body === undefined) {
            return app.request(path, { headers });
        }

        return app.request(path, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
    }

    async function membershipsOf(account: Account) {
        const result = await db.query<{ role: CourseRole }>("SELECT role FROM course_memberships WHERE course_id = $1 AND user_id = $2", [
            courseId,
            account.id,
        ]);

        return result.rows;
    }

    async function invite(account: Account): Promise<string> {
        const response = await send(`/courses/${courseId}/invitations`, teacher, { email: account.email });

        expect(response.status).toBe(201);

        return invitationSchema.parse(await response.json()).id;
    }

    beforeAll(async () => {
        await admin.query(`CREATE SCHEMA ${schema}`);

        await runMigrations(db);

        teacher = await register("teacher@example.com");
        student = await register("student@example.com");
        outsider = await register("outsider@example.com");
        colleague = await register("colleague@example.com");

        const response = await send("/courses", teacher, { code: "CSI 4500", name: "Operating Systems", slug: "os", description: "" });

        expect(response.status).toBe(201);

        courseId = z.object({ id: z.string() }).parse(await response.json()).id;
    });

    afterAll(async () => {
        await db.end();

        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);

        await admin.end();
    });

    it("applies the invitation migration once", async () => {
        expect(await runMigrations(db)).toEqual([]);
    });

    it("rejects unauthenticated requests", async () => {
        const responses = await Promise.all([
            send(`/courses/${courseId}/invitations`, undefined, { email: student.email }),
            send("/invitations"),
            send("/invitations/1/accept", undefined, {}),
        ]);

        for (const response of responses) {
            expect(response.status).toBe(401);
            expect(await response.json()).toMatchObject({ code: "UNAUTHENTICATED" });
        }
    });

    it("lets a Teacher invite a registered account that accepts and becomes a Member", async () => {
        const created = await send(`/courses/${courseId}/invitations`, teacher, { email: "  Student@Example.COM " });

        expect(created.status).toBe(201);

        const invitation = invitationSchema.parse(await created.json());

        expect(invitation).toEqual({
            id: expect.any(String),
            courseId,
            courseName: "Operating Systems",
            email: student.email,
            status: "pending",
            createdAt: expect.any(String),
        });
        expect(new Date(invitation.createdAt).toISOString()).toBe(invitation.createdAt);

        const studentList = await send("/invitations", student);

        expect(studentList.headers.get("Cache-Control")).toBe("private, no-store");
        expect(await studentList.json()).toEqual({ items: [invitation] });
        const teacherList = await send("/invitations", teacher);
        const outsiderList = await send("/invitations", outsider);

        expect(await teacherList.json()).toEqual({ items: [] });
        expect(await outsiderList.json()).toEqual({ items: [] });

        const wrongRecipient = await send(`/invitations/${invitation.id}/accept`, outsider, {});

        expect(wrongRecipient.status).toBe(404);
        expect(await wrongRecipient.json()).toMatchObject({ code: "INVITATION_NOT_FOUND" });
        expect(await membershipsOf(outsider)).toEqual([]);

        const accepted = await send(`/invitations/${invitation.id}/accept`, student, {});

        expect(accepted.status).toBe(200);
        expect(await accepted.json()).toEqual({ courseId, role: "member" });
        expect(await membershipsOf(student)).toEqual([{ role: "member" }]);
        const remaining = await send("/invitations", student);

        expect(await remaining.json()).toEqual({ items: [] });

        const retried = await send(`/invitations/${invitation.id}/accept`, student, {});

        expect(retried.status).toBe(200);
        expect(await retried.json()).toEqual({ courseId, role: "member" });
    });

    it("rejects invalid, unknown, existing and duplicate recipients", async () => {
        const cases = [
            { email: "not-an-email", status: 400, code: "INVALID_EMAIL" },
            { email: "nobody@example.com", status: 404, code: "ACCOUNT_NOT_FOUND" },
            { email: student.email, status: 409, code: "ALREADY_MEMBER" },
            { email: teacher.email, status: 409, code: "ALREADY_MEMBER" },
        ];

        for (const { email, status, code } of cases) {
            const response = await send(`/courses/${courseId}/invitations`, teacher, { email });

            expect(response.status).toBe(status);
            expect(await response.json()).toEqual({ code, message: expect.any(String) });
        }

        const malformed = await send(`/courses/${courseId}/invitations`, teacher, "{");

        expect(malformed.status).toBe(400);

        await invite(outsider);

        const duplicate = await send(`/courses/${courseId}/invitations`, teacher, { email: outsider.email.toUpperCase() });

        expect(duplicate.status).toBe(409);
        expect(await duplicate.json()).toMatchObject({ code: "INVITATION_EXISTS" });

        const pending = await db.query("SELECT id FROM course_invitations WHERE user_id = $1 AND status = 'pending'", [outsider.id]);

        expect(pending.rowCount).toBe(1);
    });

    it("allows only Teachers of the course to invite", async () => {
        const member = await send(`/courses/${courseId}/invitations`, student, { email: colleague.email });
        const unrelated = await send(`/courses/${courseId}/invitations`, colleague, { email: colleague.email });

        expect(member.status).toBe(403);
        expect(unrelated.status).toBe(404);
        expect(await unrelated.json()).toMatchObject({ code: "COURSE_NOT_FOUND" });
    });

    it("treats malformed and missing invitation IDs as not found", async () => {
        for (const invitationId of ["abc", "99999999999", "424242"]) {
            const response = await send(`/invitations/${invitationId}/accept`, student, {});

            expect(response.status).toBe(404);
            expect(await response.json()).toMatchObject({ code: "INVITATION_NOT_FOUND" });
        }
    });

    it("creates one membership from concurrent acceptance and never downgrades a Teacher", async () => {
        const invitationId = await invite(colleague);

        await db.query("INSERT INTO course_memberships (course_id, user_id, role) VALUES ($1, $2, 'teacher')", [courseId, colleague.id]);

        const responses = await Promise.all(Array.from({ length: 6 }, () => send(`/invitations/${invitationId}/accept`, colleague, {})));

        for (const response of responses) {
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ courseId, role: "teacher" });
        }

        expect(await membershipsOf(colleague)).toEqual([{ role: "teacher" }]);

        const outsiderInvitation = await db.query<{ id: number }>("SELECT id FROM course_invitations WHERE user_id = $1", [outsider.id]);
        const outsiderInvitationId = String(outsiderInvitation.rows[0]!.id);

        const concurrent = await Promise.all(
            Array.from({ length: 6 }, () => send(`/invitations/${outsiderInvitationId}/accept`, outsider, {})),
        );

        for (const response of concurrent) {
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ courseId, role: "member" });
        }

        expect(await membershipsOf(outsider)).toEqual([{ role: "member" }]);

        const invitations = await db.query("SELECT status, accepted_at FROM course_invitations WHERE id = $1", [outsiderInvitationId]);

        expect(invitations.rows).toEqual([{ status: "accepted", accepted_at: expect.any(Date) }]);
    });
});
