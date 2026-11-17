import type { BookmarkService } from "../../core/bookmark/bookmark-service.ts";
import { BookmarkError, type BookmarkErrorCode } from "../../core/bookmark/errors.ts";
import type { CourseRole } from "../../core/course-access/model.ts";
import { Hono, type Context, type Env, type MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface BookmarkRouteDependencies<E extends Env> {
    requireCourseRole: (role: CourseRole) => MiddlewareHandler<E>;
    getUserId: (c: Context) => string;
    getService: () => BookmarkService;
}

const errorResponses: Record<BookmarkErrorCode, [ContentfulStatusCode, string]> = {
    invalid_request: [400, "INVALID_BOOKMARK"],
    not_found: [404, "NOT_FOUND"],
};

export function createBookmarkRoutes<E extends Env>(dependencies: BookmarkRouteDependencies<E>) {
    const { requireCourseRole, getUserId, getService } = dependencies;

    if (typeof requireCourseRole !== "function" || typeof getUserId !== "function") {
        throw new TypeError("Course authorization middleware is required");
    }

    const member = requireCourseRole("member");

    if (typeof member !== "function") {
        throw new TypeError("Course authorization middleware is required");
    }

    const routes = new Hono<E>();

    routes.onError((error, c) => {
        if (error instanceof BookmarkError) {
            const [status, code] = errorResponses[error.code];

            return c.json({ code, message: error.message }, status);
        }

        if (error instanceof SyntaxError) {
            return c.json({ code: "INVALID_BOOKMARK", message: "Request body must be JSON." }, 400);
        }

        return c.json({ code: "BOOKMARKS_UNAVAILABLE", message: "Bookmarks are unavailable." }, 503);
    });

    routes.use(async (c, next) => {
        c.header("Cache-Control", "private, no-store");

        await next();
    });

    const collection = "/:courseId/lectures/:lectureId/bookmarks";

    routes.get(collection, member, async (c) => {
        const items = await getService().listBookmarks(c.req.param("courseId")!, c.req.param("lectureId")!, getUserId(c));

        return c.json({ items });
    });

    routes.post(collection, member, async (c) => {
        const body: unknown = await c.req.json();
        const bookmark = await getService().createBookmark(c.req.param("courseId")!, c.req.param("lectureId")!, body, getUserId(c));

        return c.json(bookmark, 201);
    });

    routes.patch(`${collection}/:bookmarkId`, member, async (c) => {
        const body: unknown = await c.req.json();
        const bookmark = await getService().updateNote(
            c.req.param("courseId")!,
            c.req.param("lectureId")!,
            c.req.param("bookmarkId")!,
            body,
            getUserId(c),
        );

        return c.json(bookmark);
    });

    routes.delete(`${collection}/:bookmarkId`, member, async (c) => {
        await getService().deleteBookmark(c.req.param("courseId")!, c.req.param("lectureId")!, c.req.param("bookmarkId")!, getUserId(c));

        return c.body(null, 204);
    });

    return routes;
}
