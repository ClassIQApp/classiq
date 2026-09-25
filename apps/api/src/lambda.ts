import app from "./index.ts";
import { handle } from "hono/aws-lambda";

export const handler = handle(app);
