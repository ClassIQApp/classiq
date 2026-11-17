import type { BookmarkRepository } from "../core/bookmark/bookmark-repository.ts";
import { BookmarkService } from "../core/bookmark/bookmark-service.ts";
import type { Bookmark } from "../core/bookmark/model.ts";
import { createBookmarkRoutes } from "../routes/bookmarks/index.ts";
import { Hono, type MiddlewareHandler } from "hono";
import { describe, expect, it } from "vitest";

const requireMember: MiddlewareHandler = async (c, next) => {
    if (!c.req.header("test-user")) {
        return c.json({ code: "UNAUTHENTICATED", message: "Sign in" }, 401);
    }

    if (c.req.param("courseId") !== "1") {
        return c.json({ code: "FORBIDDEN", message: "Not a member" }, 403);
    }

    await next();
};

const requireTestRole = () => requireMember;

function memoryRepository(): BookmarkRepository {
    const rows: (Bookmark & { userId: string })[] = [];

    return {
        lectureExists: async (courseId, lectureId) => courseId === "1" && lectureId === "2",
        listBookmarks: async (courseId, lectureId, userId) =>
            rows.filter((row) => row.courseId === courseId && row.lectureId === lectureId && row.userId === userId),
        insertBookmark: async (bookmark, userId) => {
            const row = { ...bookmark, id: String(rows.length + 1), createdAt: "2026-11-16T00:00:00.000Z", userId };

            rows.push(row);

            return row;
        },
        updateNote: async (_courseId, _lectureId, bookmarkId, userId, note) => {
            const row = rows.find((candidate) => candidate.id === bookmarkId && candidate.userId === userId);

            if (row) {
                Object.assign(row, { note });
            }

            return row;
        },
        deleteBookmark: async (_courseId, _lectureId, bookmarkId, userId) => {
            const index = rows.findIndex((row) => row.id === bookmarkId && row.userId === userId);

            return index !== -1 && rows.splice(index, 1).length === 1;
        },
    };
}

function fixture() {
    const service = new BookmarkService(memoryRepository());
    const app = new Hono().route(
        "/courses",
        createBookmarkRoutes({
            getService: () => service,
            requireCourseRole: requireTestRole,
            getUserId: (c) => c.req.header("test-user")!,
        }),
    );

    const request = (method: string, path: string, user: string | undefined, body?: unknown) =>
        app.request(`/courses/${path}`, {
            method,
            headers: { "content-type": "application/json", ...(user ? { "test-user": user } : {}) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
    const json = async (method: string, path: string, user: string, body?: unknown): Promise<unknown> => {
        const response = await request(method, path, user, body);

        return response.json();
    };

    const status = async (method: string, path: string, user: string, body?: unknown) => {
        const response = await request(method, path, user, body);

        return response.status;
    };

    return { request, json, status };
}

describe("bookmark router", () => {
    it("saves, edits, lists and deletes a bookmark", async () => {
        const { request, json, status } = fixture();

        const created = await request("POST", "1/lectures/2/bookmarks", "5", { startSeconds: 83.5, note: " ask about ATP " });

        expect(created.status).toBe(201);
        expect(created.headers.get("cache-control")).toBe("private, no-store");
        expect(await created.json()).toMatchObject({ id: "1", startSeconds: 83.5, note: "ask about ATP" });
        expect(await json("PATCH", "1/lectures/2/bookmarks/1", "5", { note: "review before exam" })).toMatchObject({
            note: "review before exam",
        });
        expect(await json("GET", "1/lectures/2/bookmarks", "5")).toMatchObject({
            items: [{ startSeconds: 83.5, note: "review before exam" }],
        });
        expect(await status("DELETE", "1/lectures/2/bookmarks/1", "5")).toBe(204);
        expect(await json("GET", "1/lectures/2/bookmarks", "5")).toEqual({ items: [] });
    });

    it("keeps bookmarks private to the user who saved them", async () => {
        const { request, json, status } = fixture();

        await request("POST", "1/lectures/2/bookmarks", "5", { startSeconds: 10 });

        expect(await json("GET", "1/lectures/2/bookmarks", "6")).toEqual({ items: [] });
        expect(await status("PATCH", "1/lectures/2/bookmarks/1", "6", { note: "mine now" })).toBe(404);
        expect(await status("DELETE", "1/lectures/2/bookmarks/1", "6")).toBe(404);
        expect(await json("GET", "1/lectures/2/bookmarks", "5")).toMatchObject({ items: [{ id: "1", note: "" }] });
    });

    it("requires course membership on every endpoint", async () => {
        const { request } = fixture();

        const responses = await Promise.all([
            request("GET", "1/lectures/2/bookmarks", undefined),
            request("GET", "9/lectures/2/bookmarks", "5"),
            request("POST", "9/lectures/2/bookmarks", "5", { startSeconds: 1 }),
            request("PATCH", "9/lectures/2/bookmarks/1", "5", { note: "x" }),
            request("DELETE", "9/lectures/2/bookmarks/1", "5"),
        ]);

        expect(responses.map((response) => response.status)).toEqual([401, 403, 403, 403, 403]);
    });

    it.each([
        ["POST", "1/lectures/2/bookmarks", { startSeconds: -1 }, 400],
        ["POST", "1/lectures/2/bookmarks", { startSeconds: 1, note: "x".repeat(281) }, 400],
        ["POST", "1/lectures/2/bookmarks", { startSeconds: 1, extra: true }, 400],
        ["POST", "1/lectures/99/bookmarks", { startSeconds: 1 }, 404],
        ["GET", "1/lectures/abc/bookmarks", undefined, 400],
    ])("rejects %s %s %j with %i", async (method, path, body, expected) => {
        const { status } = fixture();

        expect(await status(method, path, "5", body)).toBe(expected);
    });
});
