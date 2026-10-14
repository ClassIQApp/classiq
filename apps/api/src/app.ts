import courseRoutes from "./routes/courses/index.ts";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Pool } from "pg";

export interface AppEnv {
    Variables: {
        getDb: () => Pool;
    };
}

export function createApp(getDb: () => Pool): Hono<AppEnv> {
    const app = new Hono<AppEnv>();

    app.use(async (c, next) => {
        c.set("getDb", getDb);

        await next();
    });

    app.use("/courses", cors());
    app.route("/courses", courseRoutes);

    app.get("/", (c) => c.json({ message: "hello from node" }));

    return app;
}
