import { createApp } from "./app.ts";
import { getDatabase } from "./db/client.ts";

export default createApp(getDatabase);
