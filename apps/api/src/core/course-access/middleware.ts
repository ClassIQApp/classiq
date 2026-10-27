import type { AppEnv } from "../../app.ts";
import { CourseAccessService } from "./course-access-service.ts";
import { CourseAccessError, type CourseAccessErrorCode } from "./errors.ts";
import type { CourseRole } from "./model.ts";
import { PostgresCourseMembershipFacade } from "./postgres-course-membership-facade.ts";
import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const responseByErrorCode: Record<CourseAccessErrorCode, { status: ContentfulStatusCode; code: string }> = {
    not_found: { status: 404, code: "COURSE_NOT_FOUND" },
    forbidden: { status: 403, code: "FORBIDDEN" },
    provider_error: { status: 503, code: "COURSE_ACCESS_UNAVAILABLE" },
};

export function requireCourseRole(role: CourseRole): MiddlewareHandler<AppEnv> {
    return createMiddleware<AppEnv>(async (c, next) => {
        const courseId = c.req.param("courseId");
        if (courseId === undefined) {
            throw new Error("Course authorization requires a courseId route parameter");
        }

        const user = c.get("user");
        if (!user) {
            return c.json({ code: "UNAUTHENTICATED", message: "Sign in to continue" }, 401);
        }

        const courseAccessService = new CourseAccessService(new PostgresCourseMembershipFacade(c.var.getDb()));

        let courseRole: CourseRole;
        try {
            courseRole = await courseAccessService.authorize(courseId, user.id, role);
        } catch (error) {
            if (!(error instanceof CourseAccessError)) {
                throw error;
            }

            const response = responseByErrorCode[error.code];

            return c.json({ code: response.code, message: error.message }, response.status);
        }

        c.set("courseRole", courseRole);

        await next();
    });
}
