import { ApiError, createApiFetch, createAuthApi } from "../src/api/auth/client.ts";
import type { AuthApi } from "../src/api/auth/client.ts";
import { SessionController } from "../src/api/auth/session.ts";
import { QueryClient } from "@tanstack/react-query";
import assert from "node:assert/strict";
import test from "node:test";

const alice = { id: "1", name: "Alice", email: "teacher@example.com" };

const bob = { id: "2", name: "Bob", email: "bob@example.com" };

function fixture(overrides: Partial<AuthApi> = {}) {
    const cache = new QueryClient();
    const api: AuthApi = {
        getSession: async () => alice,
        signIn: async () => {},
        signUp: async () => {},
        signOut: async () => {},
        ...overrides,
    };
    const controller = new SessionController(api, () => {
        void cache.cancelQueries();
        cache.clear();
    });

    return { controller, cache, api };
}

test("native auth endpoints send cookies and JSON; restoration uses the server identity", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const transport: typeof fetch = async (url, init) => {
        calls.push({ url: String(url), init });

        return Response.json(
            String(url).endsWith("get-session") ? { user: alice, session: { id: "session" } } : { token: "never persisted" },
        );
    };
    const api = createAuthApi(createApiFetch("https://api.example.com/", transport));

    await api.signUp({ name: "Alice", email: alice.email, password: "password123" });

    await api.signIn({ email: alice.email, password: "password123" });

    assert.deepEqual(await api.getSession(), alice);

    await api.signOut();

    assert.deepEqual(
        calls.map(({ url }) => url),
        ["sign-up/email", "sign-in/email", "get-session", "sign-out"].map((path) => `https://api.example.com/api/auth/${path}`),
    );

    for (const { init } of calls) {
        assert.equal(init?.credentials, "include");
    }

    assert.equal(calls[0]?.init?.method, "POST");
    assert.equal(calls[0]?.init?.body, JSON.stringify({ name: "Alice", email: alice.email, password: "password123" }));
    assert.equal(calls[3]?.init?.body, "{}");
});

test("successful requests cannot opt out of credentials; abort signals pass through", async () => {
    const abort = new AbortController();
    const request = createApiFetch("", async (url, init) => {
        assert.equal(url, "/courses");
        assert.equal(init?.signal, abort.signal);
        assert.equal(init?.credentials, "include");

        return Response.json({ items: [] });
    });

    await request("/courses", { signal: abort.signal, credentials: "omit" });
});

test("native errors propagate; protected 401 expires identity; non-JSON errors are useful", async () => {
    let expired = 0;
    const request = createApiFetch(
        "",
        async () => Response.json({ code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" }, { status: 401 }),
        () => expired++,
    );

    await assert.rejects(
        request("/courses"),
        (error: unknown) => error instanceof ApiError && error.status === 401 && error.message === "Invalid email or password",
    );
    assert.equal(expired, 1);

    const unavailable = createApiFetch("", async () => new Response("unavailable", { status: 503 }));

    await assert.rejects(unavailable("/courses"), /Please try again/);
});

test("null and expired sessions are anonymous; malformed sessions fail closed", async () => {
    for (const response of [Response.json(null), Response.json({}, { status: 401 })]) {
        assert.equal(await createAuthApi(createApiFetch("", async () => response)).getSession(), null);
    }

    await assert.rejects(createAuthApi(createApiFetch("", async () => Response.json({ user: alice }))).getSession(), /invalid session/);
});

test("restore, logout, and another login isolate the query cache and identity", async () => {
    const { controller, cache, api } = fixture();

    await controller.restore();

    assert.deepEqual(controller.state, { status: "authenticated", user: alice });

    cache.setQueryData(["courses", alice.id], ["private course"]);

    await controller.logout();

    assert.deepEqual(controller.state, { status: "anonymous" });
    assert.equal(cache.getQueryCache().getAll().length, 0);

    api.getSession = async () => bob;

    await controller.authenticate({ email: bob.email, password: "password123" });

    assert.deepEqual(controller.state, { status: "authenticated", user: bob });
    assert.equal(cache.getQueryData(["courses", alice.id]), undefined);
});

test("in-flight course responses and old restoration cannot repopulate an expired session", async () => {
    const { controller, cache, api } = fixture();

    await controller.restore();

    let finishCourse!: (value: string[]) => void;
    const query = cache
        .fetchQuery({
            queryKey: ["courses", alice.id],
            queryFn: () =>
                new Promise<string[]>((resolve) => {
                    finishCourse = resolve;
                }),
        })
        .catch(() => undefined);
    let finishSession!: (value: typeof alice) => void;

    api.getSession = () =>
        new Promise((resolve) => {
            finishSession = resolve;
        });

    const restoring = controller.restore();

    controller.expire();
    finishCourse(["private course"]);
    finishSession(alice);

    await Promise.all([query, restoring]);

    assert.deepEqual(controller.state, { status: "anonymous" });
    assert.equal(cache.getQueryCache().getAll().length, 0);
});

test("network failure blocks restoration; retry succeeds; failed logout keeps identity", async () => {
    const { controller, api } = fixture({
        getSession: async () => {
            throw new Error("Network unavailable");
        },
    });

    await controller.restore();

    assert.deepEqual(controller.state, { status: "error", message: "Network unavailable" });

    api.getSession = async () => alice;

    await controller.restore();

    api.signOut = async () => {
        throw new Error("Logout failed");
    };

    await assert.rejects(controller.logout(), /Logout failed/);
    assert.deepEqual(controller.state, { status: "authenticated", user: alice });
});

test("failed credentials and missing post-login session never establish an identity", async () => {
    const { controller, api } = fixture({
        signIn: async () => {
            throw new Error("Invalid credentials");
        },
    });

    controller.expire();

    await assert.rejects(controller.authenticate({ email: alice.email, password: "incorrect" }), /Invalid credentials/);
    assert.deepEqual(controller.state, { status: "anonymous" });

    api.signIn = async () => {};
    api.getSession = async () => null;

    await assert.rejects(
        controller.authenticate({ name: "Alice", email: alice.email, password: "password123" }),
        /could not be established/,
    );
    assert.deepEqual(controller.state, { status: "anonymous" });
});

test("a protected 401 clears cached courses and requires sign-in again", async () => {
    const { controller, cache } = fixture();

    await controller.restore();

    cache.setQueryData(["courses", alice.id], ["private course"]);

    const request = createApiFetch(
        "",
        async () => Response.json({ code: "UNAUTHORIZED", message: "Session expired" }, { status: 401 }),
        controller.expire,
    );

    await assert.rejects(request("/courses"), /Session expired/);
    assert.deepEqual(controller.state, { status: "anonymous" });
    assert.equal(cache.getQueryCache().getAll().length, 0);
});

test("switching identities without logout also clears private queries", async () => {
    const { controller, cache, api } = fixture();

    await controller.restore();

    cache.setQueryData(["courses", alice.id], ["private course"]);

    api.getSession = async () => bob;

    await controller.authenticate({ email: bob.email, password: "password123" });

    assert.deepEqual(controller.state, { status: "authenticated", user: bob });
    assert.equal(cache.getQueryCache().getAll().length, 0);
});
