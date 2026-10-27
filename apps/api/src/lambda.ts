import { createApp } from "./app.ts";
import { readAuthConfig } from "./core/auth/config.ts";
import { getDatabase } from "./db/client.ts";
import { handle } from "hono/aws-lambda";

const app = createApp(getDatabase, {
    getAuthConfig: () => readAuthConfig({ ...process.env, NODE_ENV: "production" }),
});

export const handler = handle(app);
