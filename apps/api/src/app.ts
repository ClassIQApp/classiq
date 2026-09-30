import { Hono } from "hono";
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

    app.get("/", (c) => c.json({ message: "hello from node" }));

    return app;
}
