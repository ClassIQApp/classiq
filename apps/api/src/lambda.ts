import { createApp } from "./app.ts";
import { createDatabaseGetter } from "./db/client.ts";
import { handle } from "hono/aws-lambda";

const getDb = createDatabaseGetter(process.env.DATABASE_URL);
const app = createApp(getDb);

export const handler = handle(app);
