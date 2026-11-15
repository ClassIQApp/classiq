import { LlmError } from "../../core/ai/errors.ts";
import type { CourseRole } from "../../core/course-access/model.ts";
import { QaError } from "../../core/qa/errors.ts";
import type { QuestionService } from "../../core/qa/question-service.ts";
import { Hono, type Env, type MiddlewareHandler } from "hono";

export interface QuestionRouteDependencies<E extends Env> {
    requireCourseRole: (role: CourseRole) => MiddlewareHandler<E>;
    getService: () => QuestionService;
}

export function createQuestionRoutes<E extends Env>(dependencies: QuestionRouteDependencies<E>) {
    const { requireCourseRole, getService } = dependencies;

    if (typeof requireCourseRole !== "function") {
        throw new TypeError("Course authorization middleware is required");
    }

    const member = requireCourseRole("member");

    if (typeof member !== "function") {
        throw new TypeError("Course authorization middleware is required");
    }

    const routes = new Hono<E>();

    routes.onError((error, c) => {
        if (error instanceof QaError) {
            return c.json({ code: "INVALID_QUESTION", message: error.message }, 400);
        }

        if (error instanceof LlmError) {
            return error.code === "timeout"
                ? c.json({ code: "ANSWER_TIMEOUT", message: "The answer took too long. Try again." }, 504)
                : c.json({ code: "ANSWER_FAILED", message: "Question answering is unavailable." }, 502);
        }

        if (error instanceof SyntaxError) {
            return c.json({ code: "INVALID_QUESTION", message: "Request body must be JSON." }, 400);
        }

        return c.json({ code: "ANSWER_UNAVAILABLE", message: "Question answering is unavailable." }, 503);
    });

    routes.use(async (c, next) => {
        c.header("Cache-Control", "private, no-store");

        await next();
    });

    /* Answer a question from the course's indexed lectures and resources, with the passages it relied on */
    routes.post("/:courseId/questions", member, async (c) => {
        const body: unknown = await c.req.json();

        if (typeof body !== "object" || body === null || Array.isArray(body)) {
            throw new QaError("invalid_request");
        }

        if (Object.keys(body).some((key) => key !== "question" && key !== "lectureId")) {
            throw new QaError("invalid_request");
        }

        const { question, lectureId } = body as { question?: string; lectureId?: string };

        return c.json(
            await getService().ask(
                { courseId: c.req.param("courseId")!, question: question as string, lectureId },
                { signal: c.req.raw.signal },
            ),
        );
    });

    return routes;
}
