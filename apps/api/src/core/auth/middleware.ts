import type { AppEnv } from "../../app.ts";
import { createMiddleware } from "hono/factory";

export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
    const session = await c.var.getAuth().api.getSession({ headers: c.req.raw.headers });

    if (!session) {
        return c.json({ code: "UNAUTHENTICATED", message: "Sign in to continue" }, 401);
    }

    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
        const origin = c.req.header("Origin");
        const config = c.var.getAuthConfig();

        if (!origin || (origin !== config.baseURL && !config.trustedOrigins.includes(origin))) {
            return c.json({ code: "FORBIDDEN", message: "Request origin is not trusted" }, 403);
        }
    }

    const { id, name, email } = session.user;

    c.set("user", { id: String(id), name, email });

    await next();
});
