import type { ChatService } from "../../core/chat/chat-service.ts";
import { ChatError, type ChatErrorCode } from "../../core/chat/errors.ts";
import type { CourseRole } from "../../core/course-access/model.ts";
import { Hono, type Context, type Env, type MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface ChatRouteDependencies<E extends Env> {
    requireCourseRole: (role: CourseRole) => MiddlewareHandler<E>;
    getPoster: (c: Context) => { id: string; role: CourseRole };
    getService: () => ChatService;
}

const errorResponses: Record<ChatErrorCode, [ContentfulStatusCode, string]> = {
    invalid_request: [400, "INVALID_MESSAGE"],
    not_found: [404, "NOT_FOUND"],
    forbidden: [403, "FORBIDDEN"],
};

export function createChatRoutes<E extends Env>(dependencies: ChatRouteDependencies<E>) {
    const { requireCourseRole, getPoster, getService } = dependencies;

    if (typeof requireCourseRole !== "function" || typeof getPoster !== "function") {
        throw new TypeError("Course authorization middleware is required");
    }

    const member = requireCourseRole("member");

    if (typeof member !== "function") {
        throw new TypeError("Course authorization middleware is required");
    }

    const routes = new Hono<E>();

    routes.onError((error, c) => {
        if (error instanceof ChatError) {
            const [status, code] = errorResponses[error.code];

            return c.json({ code, message: error.message }, status);
        }

        if (error instanceof SyntaxError) {
            return c.json({ code: "INVALID_MESSAGE", message: "Request body must be JSON." }, 400);
        }

        return c.json({ code: "CHAT_UNAVAILABLE", message: "Chat is unavailable." }, 503);
    });

    routes.use(async (c, next) => {
        c.header("Cache-Control", "private, no-store");

        await next();
    });

    routes.get("/:courseId/chat/messages", member, async (c) => {
        return c.json({ items: await getService().listMessages(c.req.param("courseId")!, c.req.query("lectureId")) });
    });

    routes.post("/:courseId/chat/messages", member, async (c) => {
        const body: unknown = await c.req.json();

        if (typeof body !== "object" || body === null || Array.isArray(body)) {
            throw new ChatError("invalid_request");
        }

        if (Object.keys(body).some((key) => key !== "body" && key !== "lectureId")) {
            throw new ChatError("invalid_request");
        }

        const { body: text, lectureId } = body as { body?: string; lectureId?: string };
        const posted = await getService().postMessage(
            { courseId: c.req.param("courseId")!, lectureId, body: text as string },
            getPoster(c),
            {
                signal: c.req.raw.signal,
            },
        );

        return c.json(posted, 201);
    });

    routes.delete("/:courseId/chat/messages/:messageId", member, async (c) => {
        await getService().deleteMessage(c.req.param("courseId")!, c.req.param("messageId")!, getPoster(c));

        return c.body(null, 204);
    });

    return routes;
}
