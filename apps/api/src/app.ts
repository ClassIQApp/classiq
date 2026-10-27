import { createAuth, type AuthenticatedUser, type AuthService } from "./core/auth/auth.ts";
import { readAuthConfig, type AuthConfig } from "./core/auth/config.ts";
import authRoutes from "./routes/auth/index.ts";
import courseRoutes from "./routes/courses/index.ts";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Pool } from "pg";

export interface AppEnv {
    Variables: {
        getDb: () => Pool;
        getAuth: () => AuthService;
        getAuthConfig: () => AuthConfig;
        user: AuthenticatedUser;
    };
}

export interface AppOptions {
    getAuth?: () => AuthService;
    getAuthConfig?: () => AuthConfig;
}

export function createApp(getDb: () => Pool, options: AppOptions = {}): Hono<AppEnv> {
    const app = new Hono<AppEnv>();
    let auth: AuthService | undefined;
    let config: AuthConfig | undefined;
    const getConfig = () => (config ??= (options.getAuthConfig ?? readAuthConfig)());
    const getAuth = options.getAuth ?? (() => (auth ??= createAuth(getDb(), getConfig())));

    app.use(async (c, next) => {
        c.set("getDb", getDb);
        c.set("getAuth", getAuth);
        c.set("getAuthConfig", getConfig);

        await next();
    });

    app.use("*", async (c, next) => {
        if (!c.req.header("Origin") && c.req.method !== "OPTIONS") {
            return next();
        }

        return cors({
            origin: (origin) => (getConfig().trustedOrigins.includes(origin) ? origin : undefined),
            credentials: true,
            allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allowHeaders: ["Content-Type", "Authorization"],
        })(c, next);
    });

    app.route("/api/auth", authRoutes);
    app.route("/courses", courseRoutes);
    app.get("/", (c) => c.json({ message: "hello from node" }));

    return app;
}
