import type { AuthenticatedUser } from "../../core/auth/auth.ts";
import type { CourseRole } from "../../core/course-access/model.ts";
import type { CourseInvitationService } from "../../core/course-invitation/course-invitation-service.ts";
import { CourseInvitationError, type CourseInvitationErrorCode } from "../../core/course-invitation/errors.ts";
import type { InvitationRequest } from "../../core/course-invitation/model.ts";
import { Hono, type Context, type Env, type MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface InvitationEnv extends Env {
    Variables: {
        user: AuthenticatedUser;
    };
}

export interface CourseInvitationRouteDependencies<E extends InvitationEnv> {
    requireCourseRole: (role: CourseRole) => MiddlewareHandler<E>;
    getInvitationService: () => CourseInvitationService;
}

export interface InvitationRouteDependencies<E extends InvitationEnv> {
    requireSession: MiddlewareHandler<E>;
    getInvitationService: () => CourseInvitationService;
}

const responses: Record<CourseInvitationErrorCode, { status: ContentfulStatusCode; code: string }> = {
    invalid_email: { status: 400, code: "INVALID_EMAIL" },
    account_not_found: { status: 404, code: "ACCOUNT_NOT_FOUND" },
    already_member: { status: 409, code: "ALREADY_MEMBER" },
    invitation_exists: { status: 409, code: "INVITATION_EXISTS" },
    not_found: { status: 404, code: "INVITATION_NOT_FOUND" },
    provider_error: { status: 503, code: "INVITATIONS_UNAVAILABLE" },
};

function respondToError(error: Error, c: Context) {
    if (error instanceof CourseInvitationError) {
        const { status, code } = responses[error.code];

        return c.json({ code, message: error.message }, status);
    }

    if (error instanceof SyntaxError) {
        return c.json({ code: "INVALID_EMAIL", message: "Enter a valid email address." }, 400);
    }

    const { status, code } = responses.provider_error;

    return c.json({ code, message: new CourseInvitationError("provider_error").message }, status);
}

export function createCourseInvitationRoutes<E extends InvitationEnv>(dependencies: CourseInvitationRouteDependencies<E>) {
    const { requireCourseRole, getInvitationService } = dependencies;

    const routes = new Hono<E>();

    routes.onError(respondToError);

    routes.use(requireCourseRole("teacher"));

    /* Invite a registered account to a course */
    routes.post("/", async (c) => {
        const courseId = c.req.param("courseId");
        if (!courseId) {
            throw new CourseInvitationError("not_found");
        }

        const body = await c.req.json<InvitationRequest>();

        const invitation = await getInvitationService().invite(courseId, c.var.user.id, body);

        return c.json(invitation, 201);
    });

    return routes;
}

export function createInvitationRoutes<E extends InvitationEnv>(dependencies: InvitationRouteDependencies<E>) {
    const { requireSession, getInvitationService } = dependencies;

    const routes = new Hono<E>();

    routes.onError(respondToError);

    routes.use(requireSession, async (c, next) => {
        c.header("Cache-Control", "private, no-store");

        await next();
    });

    /* Get pending invitations for the current account */
    routes.get("/", async (c) => {
        const invitations = await getInvitationService().listPending(c.var.user.id);

        return c.json({ items: invitations });
    });

    /* Accept an invitation addressed to the current account */
    routes.post("/:invitationId/accept", async (c) => {
        const acceptance = await getInvitationService().accept(c.req.param("invitationId"), c.var.user.id);

        return c.json(acceptance);
    });

    return routes;
}
