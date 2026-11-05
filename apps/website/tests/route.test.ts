import { parseRoute, routeUrl } from "../src/navigation/route.ts";
import type { AppRoute } from "../src/navigation/route.ts";
import assert from "node:assert/strict";
import test from "node:test";

test("course, section and lecture URLs round-trip through the route", () => {
    const routes: AppRoute[] = [
        { name: "courses" },
        { name: "settings" },
        { name: "course", courseId: "5", section: "lectures" },
        { name: "course", courseId: "5", section: "resources" },
        { name: "course", courseId: "5", section: "search" },
        { name: "course", courseId: "5", section: "chat" },
        { name: "lecture", courseId: "5", lectureId: "8", startSeconds: undefined },
        { name: "lecture", courseId: "5", lectureId: "8", startSeconds: 506 },
    ];

    for (const route of routes) {
        const url = routeUrl(route);
        const [pathname, search] = url.split("?");

        assert.deepEqual(parseRoute(pathname!, search ? `?${search}` : ""), route, url);
    }

    assert.equal(routeUrl({ name: "course", courseId: "5", section: "resources" }), "/courses/5/resources");
    assert.equal(routeUrl({ name: "lecture", courseId: "5", lectureId: "8", startSeconds: 506.7 }), "/courses/5/lectures/8?t=506");
});

test("unknown paths fall back to the nearest valid page", () => {
    assert.deepEqual(parseRoute("/nowhere"), { name: "courses" });
    assert.deepEqual(parseRoute("/courses/5/unknown"), { name: "course", courseId: "5", section: "lectures" });
    assert.deepEqual(parseRoute("/courses/5/lectures/8", "?t=abc"), {
        name: "lecture",
        courseId: "5",
        lectureId: "8",
        startSeconds: undefined,
    });
});
