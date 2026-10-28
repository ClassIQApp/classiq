import { LlmError } from "../../core/ai/errors.ts";
import type { CourseRole } from "../../core/course-access/model.ts";
import { QuizError } from "../../core/quiz/errors.ts";
import type { QuizService } from "../../core/quiz/quiz-service.ts";
import { Hono, type Context, type Env, type MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface QuizRouteDependencies<E extends Env> {
    requireCourseRole: (role: CourseRole) => MiddlewareHandler<E>;
    /** Reads the signed-in user's id; attempts always belong to this user. */
    getUserId: (c: Context) => string;
    getService: () => QuizService;
}

const errorResponses: Record<QuizError["code"], [ContentfulStatusCode, string]> = {
    invalid_request: [400, "INVALID_QUIZ_REQUEST"],
    invalid_attempt: [400, "INVALID_ATTEMPT"],
    not_found: [404, "NOT_FOUND"],
    no_content: [409, "NO_CONTENT"],
    generation_failed: [502, "GENERATION_FAILED"],
};

export function createQuizRoutes<E extends Env>(dependencies: QuizRouteDependencies<E>) {
    const { requireCourseRole, getUserId, getService } = dependencies;

    if (typeof requireCourseRole !== "function" || typeof getUserId !== "function") {
        throw new TypeError("Course authorization middleware is required");
    }

    const teacher = requireCourseRole("teacher");
    const member = requireCourseRole("member");

    if (typeof teacher !== "function" || typeof member !== "function") {
        throw new TypeError("Course authorization middleware is required");
    }

    const routes = new Hono<E>();

    routes.onError((error, c) => {
        if (error instanceof QuizError) {
            const [status, code] = errorResponses[error.code];

            return c.json({ code, message: error.message }, status);
        }

        if (error instanceof LlmError) {
            return error.code === "timeout"
                ? c.json({ code: "GENERATION_TIMEOUT", message: "Quiz generation took too long. Try fewer questions." }, 504)
                : c.json({ code: "GENERATION_FAILED", message: "The quiz generator is unavailable." }, 502);
        }

        if (error instanceof SyntaxError) {
            return c.json({ code: "INVALID_QUIZ_REQUEST", message: "Request body must be JSON." }, 400);
        }

        return c.json({ code: "QUIZ_UNAVAILABLE", message: "Quizzes are unavailable." }, 503);
    });

    routes.use(async (c, next) => {
        c.header("Cache-Control", "private, no-store");

        await next();
    });

    /* Generate a quiz from a lecture's indexed content, or the whole course's */
    routes.post("/:courseId/quizzes", teacher, async (c) => {
        const body: unknown = await c.req.json();

        if (typeof body !== "object" || body === null || Array.isArray(body)) {
            throw new QuizError("invalid_request");
        }

        if (Object.keys(body).some((key) => key !== "lectureId" && key !== "questionCount")) {
            throw new QuizError("invalid_request");
        }

        const { lectureId, questionCount } = body as { lectureId?: string; questionCount?: number };
        const quiz = await getService().generateQuiz(
            {
                courseId: c.req.param("courseId")!,
                lectureId,
                questionCount,
                createdByUserId: getUserId(c),
            },
            { signal: c.req.raw.signal },
        );

        return c.json(quiz, 201);
    });

    /* List a course's quizzes, optionally for one lecture */
    routes.get("/:courseId/quizzes", member, async (c) => {
        return c.json({ items: await getService().listQuizzes(c.req.param("courseId")!, c.req.query("lectureId")) });
    });

    /* Get a quiz to take; answers are only revealed after submitting */
    routes.get("/:courseId/quizzes/:quizId", member, async (c) => {
        return c.json(await getService().getQuiz(c.req.param("courseId")!, c.req.param("quizId")!));
    });

    /* Submit answers and get the scored result with the answer review */
    routes.post("/:courseId/quizzes/:quizId/attempts", member, async (c) => {
        const result = await getService().submitAttempt(c.req.param("courseId")!, c.req.param("quizId")!, getUserId(c), await c.req.json());

        return c.json(result, 201);
    });

    /* List the signed-in user's attempts at a quiz */
    routes.get("/:courseId/quizzes/:quizId/attempts", member, async (c) => {
        return c.json({ items: await getService().listAttempts(c.req.param("courseId")!, c.req.param("quizId")!, getUserId(c)) });
    });

    /* Review one of the signed-in user's attempts */
    routes.get("/:courseId/quizzes/:quizId/attempts/:attemptId", member, async (c) => {
        return c.json(
            await getService().getAttempt(c.req.param("courseId")!, c.req.param("quizId")!, c.req.param("attemptId")!, getUserId(c)),
        );
    });

    return routes;
}
