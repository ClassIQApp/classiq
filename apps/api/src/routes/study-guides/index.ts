import { LlmError } from "../../core/ai/errors.ts";
import type { CourseRole } from "../../core/course-access/model.ts";
import { StudyGuideError } from "../../core/study-guide/errors.ts";
import type { StudyGuideService } from "../../core/study-guide/study-guide-service.ts";
import { Hono, type Context, type Env, type MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface StudyGuideRouteDependencies<E extends Env> {
    requireCourseRole: (role: CourseRole) => MiddlewareHandler<E>;
    getUserId: (c: Context) => string;
    getService: () => StudyGuideService;
}

const errorResponses: Record<StudyGuideError["code"], [ContentfulStatusCode, string]> = {
    invalid_request: [400, "INVALID_STUDY_GUIDE_REQUEST"],
    not_found: [404, "NOT_FOUND"],
    no_content: [409, "NO_CONTENT"],
    generation_failed: [502, "GENERATION_FAILED"],
};

export function createStudyGuideRoutes<E extends Env>(dependencies: StudyGuideRouteDependencies<E>) {
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
        if (error instanceof StudyGuideError) {
            const [status, code] = errorResponses[error.code];

            return c.json(
                {
                    code,
                    message: error.message,
                },
                status,
            );
        }

        if (error instanceof LlmError) {
            return error.code === "timeout"
                ? c.json(
                      {
                          code: "GENERATION_TIMEOUT",
                          message: "Study guide generation took too long. Try again.",
                      },
                      504,
                  )
                : c.json(
                      {
                          code: "GENERATION_FAILED",
                          message: "The study guide generator is unavailable.",
                      },
                      502,
                  );
        }

        if (error instanceof SyntaxError) {
            return c.json(
                {
                    code: "INVALID_STUDY_GUIDE_REQUEST",
                    message: "Request body must be JSON.",
                },
                400,
            );
        }

        return c.json(
            {
                code: "STUDY_GUIDE_UNAVAILABLE",
                message: "Study guides are unavailable.",
            },
            503,
        );
    });

    routes.use(async (c, next) => {
        c.header("Cache-Control", "private, no-store");

        await next();
    });

    /*
     * Generate a study guide from a lecture's indexed content,
     * or from the entire course when lectureId is omitted.
     */
    routes.post("/:courseId/study-guides", teacher, async (c) => {
        const body: unknown = await c.req.json();

        if (typeof body !== "object" || body === null || Array.isArray(body)) {
            throw new StudyGuideError("invalid_request");
        }

        if (Object.keys(body).some((key) => key !== "lectureId")) {
            throw new StudyGuideError("invalid_request");
        }

        const { lectureId } = body as {
            lectureId?: string;
        };

        const guide = await getService().generateStudyGuide(
            {
                courseId: c.req.param("courseId")!,
                lectureId,
                createdByUserId: getUserId(c),
            },
            {
                signal: c.req.raw.signal,
            },
        );

        return c.json(guide, 201);
    });

    /*
     * List study guides for the course.
     * lectureId can optionally filter the list to one lecture.
     */
    routes.get("/:courseId/study-guides", member, async (c) => {
        const guides = await getService().listStudyGuides(c.req.param("courseId")!, c.req.query("lectureId"));

        return c.json({
            items: guides,
        });
    });

    /*
     * Retrieve one complete study guide including
     * sections and stored source context.
     */
    routes.get("/:courseId/study-guides/:studyGuideId", member, async (c) => {
        const guide = await getService().getStudyGuide(c.req.param("courseId")!, c.req.param("studyGuideId")!);

        return c.json(guide);
    });

    return routes;
}
