import { ContentIndexService } from "../../core/content-index/content-index-service.ts";
import { ContentIndexError } from "../../core/content-index/errors.ts";
import type { ContentSourceKind } from "../../core/content-index/model.ts";
import { PostgresContentIndexRepository } from "../../core/content-index/postgres-content-index-repository.ts";
import { Hono, type Env, type MiddlewareHandler } from "hono";
import type { Pool } from "pg";

export interface ContentRouteDependencies<E extends Env> {
    requireCourseRole: (role: "member" | "teacher") => MiddlewareHandler<E>;
    service: ContentIndexService;
}

export function createContentRoutes<E extends Env>(dependencies: ContentRouteDependencies<E>) {
    const { requireCourseRole, service } = dependencies;

    if (typeof requireCourseRole !== "function") {
        throw new TypeError("Course authorization middleware is required");
    }

    const member = requireCourseRole("member");

    if (typeof member !== "function") {
        throw new TypeError("Course authorization middleware is required");
    }

    const routes = new Hono<E>();

    routes.onError((error, c) => {
        if (error instanceof ContentIndexError && error.code === "not_found") {
            return c.json({ code: "NOT_FOUND", message: error.message }, 404);
        }

        if (error instanceof ContentIndexError) {
            return c.json({ code: "INVALID_SEARCH", message: error.message }, 400);
        }

        return c.json({ code: "SEARCH_UNAVAILABLE", message: "Content search is unavailable." }, 503);
    });

    /* Retrieve passages from indexed lecture transcripts and course resources */
    routes.get("/:courseId/search", member, async (c) => {
        const limit = c.req.query("limit");

        const items = await service.search({
            courseId: c.req.param("courseId")!,
            text: c.req.query("q") ?? "",
            lectureId: c.req.query("lectureId"),
            kinds: c.req.queries("kind") as ContentSourceKind[] | undefined,
            limit: limit === undefined ? undefined : Number(limit),
        });

        c.header("Cache-Control", "private, no-store");

        return c.json({ items });
    });

    return routes;
}

export function createPersistentContentRoutes<E extends Env>(options: {
    requireCourseRole: ContentRouteDependencies<E>["requireCourseRole"];
    database: Pool;
}) {
    return createContentRoutes<E>({
        requireCourseRole: options.requireCourseRole,
        service: new ContentIndexService(new PostgresContentIndexRepository(options.database)),
    });
}
