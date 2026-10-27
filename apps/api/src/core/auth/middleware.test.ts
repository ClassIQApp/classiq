import { createApp } from "../../app.ts";
import type { AuthenticatedUser, AuthService } from "./auth.ts";
import { requireSession } from "./middleware.ts";
import { describe, expect, it, vi } from "vitest";

function appWithSession(user: AuthenticatedUser | null) {
    const getSession = vi.fn<AuthService["api"]["getSession"]>(async () => (user ? { user } : null));
    const auth: AuthService = { handler: async () => new Response(), api: { getSession } };
    const getDb = vi.fn(() => {
        throw new Error("Injected auth must not connect to PostgreSQL");
    });
    const app = createApp(getDb, { getAuth: () => auth });

    app.get("/protected", requireSession, (c) => c.json(c.var.user));

    return { app, getSession, getDb };
}

describe("injectable session middleware", () => {
    it("returns a domain 401 when no session is found", async () => {
        const { app, getDb } = appWithSession(null);

        const response = await app.request("/protected");

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ code: "UNAUTHENTICATED", message: "Sign in to continue" });
        expect(getDb).not.toHaveBeenCalled();
    });

    it("forwards request headers and exposes the authenticated user", async () => {
        const user = { id: "42", name: "Student", email: "student@example.com" };
        const { app, getSession, getDb } = appWithSession(user);

        const response = await app.request("/protected", { headers: { Cookie: "test-session=value" } });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(user);
        expect(getSession).toHaveBeenCalledWith({ headers: expect.any(Headers) });
        expect(getSession.mock.calls[0]?.[0].headers.get("Cookie")).toBe("test-session=value");
        expect(getDb).not.toHaveBeenCalled();
    });
});
