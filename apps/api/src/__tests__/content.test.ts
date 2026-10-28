import { createApp } from "../app.ts";
import type { ContentIndexRepository } from "../core/content-index/content-index-repository.ts";
import { ContentIndexService } from "../core/content-index/content-index-service.ts";
import type { ContentPassage } from "../core/content-index/model.ts";
import { createContentRoutes } from "../routes/content/index.ts";
import { Hono, type MiddlewareHandler } from "hono";
import { describe, expect, it, vi } from "vitest";

const passage: ContentPassage = {
    id: "5",
    kind: "transcript",
    courseId: "1",
    lectureId: "2",
    title: "Enzymes",
    content: "Enzymes lower activation energy.",
    startSeconds: 12,
    endSeconds: 30,
    score: 0.4,
};

const requireTestRole: MiddlewareHandler = async (c, next) => {
    const granted = c.req.header("test-role");

    if (!granted) {
        return c.json({ code: "UNAUTHENTICATED", message: "Sign in" }, 401);
    }

    if (granted !== "teacher" && granted !== "member") {
        return c.json({ code: "FORBIDDEN", message: "Insufficient role" }, 403);
    }

    await next();
};

function fixture(search: ContentIndexRepository["search"] = async () => [passage]) {
    const repository = {
        findSource: vi.fn(),
        replaceChunks: vi.fn(),
        markFailed: vi.fn(),
        search: vi.fn(search),
        listPassages: vi.fn(),
    } satisfies ContentIndexRepository;
    const app = new Hono().route(
        "/courses",
        createContentRoutes({
            service: new ContentIndexService(repository),
            requireCourseRole: () => requireTestRole,
        }),
    );

    function request(query: string, role = "member") {
        return app.request(`/courses/1/search?${query}`, { headers: { "test-role": role } });
    }

    return { repository, request };
}

describe("content search router", () => {
    it("leaves search unmounted in the application until authorization is integrated", async () => {
        const app = createApp(() => {
            throw new Error("Database must not be accessed");
        });

        const response = await app.request("/courses/1/search?q=enzymes");

        expect(response.status).not.toBe(200);
    });

    it("requires injected authorization at construction", () => {
        expect(() =>
            createContentRoutes({ service: new ContentIndexService(fixture().repository), requireCourseRole: undefined! }),
        ).toThrow("authorization");
    });

    it.each([
        ["", 401],
        ["unrelated", 403],
    ])("denies role %j", async (role, status) => {
        const { request, repository } = fixture();

        const response = await request("q=enzymes", role);

        expect(response.status).toBe(status);
        expect(repository.search).not.toHaveBeenCalled();
    });

    it("returns traceable passages to course members", async () => {
        const { request, repository } = fixture();

        const response = await request("q=enzymes&lectureId=2&kind=transcript&kind=resource&limit=5");

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(await response.json()).toEqual({ items: [passage] });
        expect(repository.search).toHaveBeenCalledWith({
            courseId: "1",
            text: "enzymes",
            lectureId: "2",
            kinds: ["transcript", "resource"],
            limit: 5,
        });
    });

    it.each(["", "q=", "q=enzymes&limit=abc", "q=enzymes&limit=50", "q=enzymes&kind=video", "q=enzymes&lectureId=x"])(
        "rejects invalid query %j",
        async (query) => {
            const { request } = fixture();

            const response = await request(query);

            expect(response.status).toBe(400);
            expect(await response.json()).toMatchObject({ code: "INVALID_SEARCH" });
        },
    );

    it("hides storage errors", async () => {
        const { request } = fixture(async () => {
            throw new Error("connection refused at 10.0.0.1");
        });

        const response = await request("q=enzymes");

        expect(response.status).toBe(503);
        expect(await response.text()).not.toContain("10.0.0.1");
    });
});
