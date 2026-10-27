import { createApp } from "../../app.ts";
import { migrationsDirectory, runMigrations } from "../../db/migrate.ts";
import { createAuth } from "./auth.ts";
import type { AuthConfig } from "./config.ts";
import { requireSession } from "./middleware.ts";
import { randomUUID } from "node:crypto";
import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

const userResponseSchema = z.object({
    user: z.object({ id: z.string(), name: z.string(), email: z.string(), emailVerified: z.boolean() }),
});

const errorResponseSchema = z.object({ code: z.string() });

const databaseURL = process.env.AUTH_TEST_DATABASE_URL;

const origin = "http://localhost:5173";

const config: AuthConfig = {
    secret: "classiq-auth-integration-only-secret-123456789",
    baseURL: "http://localhost:3000",
    trustedOrigins: [origin, "http://127.0.0.1:5173"],
    production: false,
};

function databaseFixture() {
    const schema = `auth_test_${randomUUID().replaceAll("-", "")}`;
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

function makeApp(db: Pool, authConfig = config) {
    const app = createApp(() => db, { getAuthConfig: () => authConfig });

    app.on(["GET", "POST"], "/protected", requireSession, (c) => c.json(c.var.user));

    return app;
}

function cookieFrom(response: Response): string {
    const cookies = response.headers
        .getSetCookie()
        .map((cookie) => cookie.split(";")[0])
        .join("; ");

    expect(cookies).toContain("session_token=");

    return cookies;
}

function signUp(app: ReturnType<typeof makeApp>, email: string) {
    return app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ name: "Test Student", email, password: "correct-password-123" }),
    });
}

const describeDatabase = describe.skipIf(!databaseURL);

describeDatabase("auth migration on a populated database", () => {
    const db = databaseFixture();

    it("preserves legacy user IDs, references and migration checksums", async () => {
        const directory = await mkdtemp(path.join(tmpdir(), "classiq-auth-migrations-"));

        try {
            const entries = await readdir(migrationsDirectory);

            const files = entries.filter((file) => file.endsWith(".sql") && file < "005");

            await Promise.all(files.map((file) => copyFile(path.join(migrationsDirectory, file), path.join(directory, file))));

            await runMigrations(db, directory);

            await db.query("INSERT INTO users (id) VALUES (42)");

            await db.query("SELECT setval(pg_get_serial_sequence('users', 'id'), 42)");

            await db.query("INSERT INTO courses (id, name, slug) VALUES (1, 'Legacy course', 'legacy')");

            await db.query("INSERT INTO lectures (id, fk_course_id) VALUES (1, 1)");

            await db.query(`
                INSERT INTO lecture_chat_messages (content, fk_sender_user_id, fk_lecture_id)
                VALUES ('legacy', 42, 1)
                `);

            expect(await runMigrations(db)).toContain("005_auth.sql");
            expect(await runMigrations(db)).toEqual([]);

            const legacy = await db.query(
                `
                SELECT users.id, users.email, messages.fk_sender_user_id
                FROM users JOIN lecture_chat_messages messages ON users.id = messages.fk_sender_user_id
                `,
            );

            expect(legacy.rows).toEqual([{ id: 42, email: null, fk_sender_user_id: 42 }]);

            const accounts = await db.query("SELECT * FROM auth_accounts");

            expect(accounts.rowCount).toBe(0);

            const response = await signUp(makeApp(db), "new@example.com");

            expect(response.status).toBe(200);
            expect(userResponseSchema.parse(await response.json()).user.id).toBe("43");

            const column = await db.query(
                `
                SELECT data_type
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                    AND table_name = 'users'
                    AND column_name = 'id'
                `,
            );

            expect(column.rows[0].data_type).toBe("integer");
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});

describeDatabase("database-backed auth HTTP endpoints", () => {
    const db = databaseFixture();
    const app = makeApp(db);

    beforeAll(async () => {
        expect(await runMigrations(db)).toContain("005_auth.sql");
        expect(await runMigrations(db)).toEqual([]);
    });

    it("registers, normalizes email, hashes passwords and restores a cookie session", async () => {
        const response = await signUp(app, "Student@EXAMPLE.com");

        expect(response.status).toBe(200);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
        expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
        expect(response.headers.getSetCookie().join(";")).toMatch(/HttpOnly/i);
        expect(response.headers.getSetCookie().join(";")).toMatch(/SameSite=Lax/i);

        const body = userResponseSchema.parse(await response.json());

        expect(body.user).toMatchObject({
            id: expect.any(String),
            name: "Test Student",
            email: "student@example.com",
            emailVerified: false,
        });

        const stored = await db.query("SELECT password FROM auth_accounts WHERE user_id = $1", [body.user.id]);

        expect(stored.rows[0].password).toBeTruthy();
        expect(stored.rows[0].password).not.toContain("correct-password-123");

        const cookie = cookieFrom(response);

        const restored = await makeApp(db).request("/api/auth/get-session", { headers: { Cookie: cookie } });

        expect(userResponseSchema.parse(await restored.json()).user.id).toBe(body.user.id);

        const protectedResponse = await app.request("/protected", { headers: { Cookie: cookie } });

        expect(await protectedResponse.json()).toEqual({ id: body.user.id, name: "Test Student", email: "student@example.com" });
    });

    it("rejects duplicate email and invalid registration input with native errors", async () => {
        const signup = await signUp(app, "duplicate@example.com");

        expect(signup.status).toBe(200);

        const duplicate = await signUp(app, "DUPLICATE@example.com");

        expect(duplicate.status).toBe(422);
        expect(errorResponseSchema.parse(await duplicate.json()).code).toBe("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL");

        for (const invalid of [
            { email: "not-an-email", password: "correct-password-123", name: "Student" },
            { email: "short@example.com", password: "short", name: "Student" },
            { email: "long@example.com", password: "x".repeat(129), name: "Student" },
            { email: "missing-name@example.com", password: "correct-password-123" },
        ]) {
            const response = await app.request("/api/auth/sign-up/email", {
                method: "POST",
                headers: { "Content-Type": "application/json", Origin: origin },
                body: JSON.stringify(invalid),
            });

            expect(response.status).toBeGreaterThanOrEqual(400);
            expect(response.status).toBeLessThan(500);
            expect(errorResponseSchema.parse(await response.json()).code).toEqual(expect.any(String));
        }
    });

    it("logs in, rejects incorrect credentials, logs out and revokes the old cookie", async () => {
        const signup = await signUp(app, "login@example.com");

        expect(signup.status).toBe(200);

        for (const [email, password, status] of [
            ["login@example.com", "wrong-password", 401],
            ["unknown@example.com", "correct-password-123", 401],
            ["LOGIN@example.com", "correct-password-123", 200],
        ] as const) {
            const response = await app.request("/api/auth/sign-in/email", {
                method: "POST",
                headers: { "Content-Type": "application/json", Origin: origin },
                body: JSON.stringify({ email, password }),
            });

            expect(response.status).toBe(status);

            if (status === 200) {
                const cookie = cookieFrom(response);
                const userId = userResponseSchema.parse(await response.json()).user.id;

                const logout = await app.request("/api/auth/sign-out", {
                    method: "POST",
                    headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
                    body: "{}",
                });

                expect(logout.status).toBe(200);
                expect(logout.headers.getSetCookie().join(";")).toContain("Max-Age=0");

                const revokedSession = await app.request("/api/auth/get-session", { headers: { Cookie: cookie } });

                expect(await revokedSession.json()).toBeNull();

                const revokedAccess = await app.request("/protected", { headers: { Cookie: cookie } });

                expect(revokedAccess.status).toBe(401);

                const remainingSessions = await db.query("SELECT id FROM auth_sessions WHERE user_id = $1", [userId]);

                expect(remainingSessions.rowCount).toBe(1);
            }
        }
    });

    it("rejects missing, tampered and expired sessions", async () => {
        const anonymousSession = await app.request("/api/auth/get-session");

        expect(await anonymousSession.json()).toBeNull();

        const anonymousAccess = await app.request("/protected");

        expect(anonymousAccess.status).toBe(401);

        const response = await signUp(app, "expired@example.com");

        const cookie = cookieFrom(response);
        const userId = userResponseSchema.parse(await response.json()).user.id;

        const tamperedAccess = await app.request("/protected", { headers: { Cookie: `${cookie}tampered` } });

        expect(tamperedAccess.status).toBe(401);

        await db.query("UPDATE auth_sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1", [userId]);

        const expiredSession = await app.request("/api/auth/get-session", { headers: { Cookie: cookie } });

        expect(await expiredSession.json()).toBeNull();

        const expiredAccess = await app.request("/protected", { headers: { Cookie: cookie } });

        expect(expiredAccess.status).toBe(401);
    });

    it("retains CSRF, origin and callback URL protection", async () => {
        const cookie = cookieFrom(await signUp(app, "csrf@example.com"));

        for (const badOrigin of ["https://evil.example", "null"]) {
            const response = await app.request("/api/auth/sign-out", {
                method: "POST",
                headers: { Origin: badOrigin, Cookie: cookie, "Content-Type": "application/json" },
                body: "{}",
            });

            expect(response.status).toBe(403);
            expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();

            const activeSession = await app.request("/protected", { headers: { Cookie: cookie } });

            expect(activeSession.status).toBe(200);
        }

        const missingOrigin = await app.request("/api/auth/sign-out", {
            method: "POST",
            headers: { Cookie: cookie, "Content-Type": "application/json" },
            body: "{}",
        });

        expect(missingOrigin.status).toBe(403);

        const untrustedOrigin = await app.request("/api/auth/sign-in/email", {
            method: "POST",
            headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
            body: JSON.stringify({ email: "csrf@example.com", password: "correct-password-123" }),
        });

        expect(untrustedOrigin.status).toBe(403);

        const untrustedSignup = await app.request("/api/auth/sign-up/email", {
            method: "POST",
            headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Student", email: "untrusted@example.com", password: "correct-password-123" }),
        });

        expect(untrustedSignup.status).toBe(403);

        const crossSiteForm = await app.request("/api/auth/sign-in/email", {
            method: "POST",
            headers: { "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate", "Content-Type": "application/x-www-form-urlencoded" },
            body: "email=csrf%40example.com&password=correct-password-123",
        });

        expect(crossSiteForm.status).toBe(403);

        const untrustedCallback = await app.request("/api/auth/sign-in/email", {
            method: "POST",
            headers: { Origin: origin, "Content-Type": "application/json" },
            body: JSON.stringify({ email: "csrf@example.com", password: "correct-password-123", callbackURL: "https://evil.example" }),
        });

        expect(untrustedCallback.status).toBe(403);
    });

    it("protects downstream cookie-authenticated mutations from untrusted and missing origins", async () => {
        const cookie = cookieFrom(await signUp(app, "domain-csrf@example.com"));

        for (const requestOrigin of [undefined, "https://evil.example", "http://untrusted.localhost:5173", origin]) {
            const response = await app.request("/protected", {
                method: "POST",
                headers: { Cookie: cookie, ...(requestOrigin ? { Origin: requestOrigin } : {}) },
            });

            expect(response.status).toBe(requestOrigin === origin ? 200 : 403);
        }
    });

    it("allows credentialed preflight only for configured development origins", async () => {
        for (const allowedOrigin of config.trustedOrigins) {
            const response = await app.request("/courses/1", {
                method: "OPTIONS",
                headers: {
                    Origin: allowedOrigin,
                    "Access-Control-Request-Method": "PATCH",
                    "Access-Control-Request-Headers": "Content-Type",
                },
            });

            expect(response.status).toBe(204);
            expect(response.headers.get("Access-Control-Allow-Origin")).toBe(allowedOrigin);
            expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
            expect(response.headers.get("Access-Control-Allow-Methods")).toContain("PATCH");
        }

        const response = await app.request("/api/auth/get-session", { method: "OPTIONS", headers: { Origin: "https://evil.example" } });

        expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();

        const publicRoute = await app.request("/");

        expect(publicRoute.status).toBe(200);
    });

    it("uses Secure HttpOnly cookies in production", async () => {
        const production = makeApp(db, {
            ...config,
            production: true,
            baseURL: "https://api.example.com",
            trustedOrigins: ["https://example.com"],
        });

        const response = await production.request("https://api.example.com/api/auth/sign-up/email", {
            method: "POST",
            headers: { Origin: "https://example.com", "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Production Test", email: "secure@example.com", password: "correct-password-123" }),
        });

        expect(response.status).toBe(200);

        const cookies = response.headers.getSetCookie().join(";");

        expect(cookies).toContain("__Secure-");
        expect(cookies).toMatch(/; Secure/i);
        expect(cookies).toMatch(/; HttpOnly/i);

        const session = await createAuth(db, { ...config, production: true, baseURL: "https://api.example.com" }).api.getSession({
            headers: new Headers({ Cookie: cookieFrom(response) }),
        });

        expect(session?.user.email).toBe("secure@example.com");
    });
});
