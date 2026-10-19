import { createApp } from "./app.ts";
import { createDatabaseGetter } from "./db/client.ts";

const getDb = createDatabaseGetter(process.env.DATABASE_URL);

export default createApp(getDb);
