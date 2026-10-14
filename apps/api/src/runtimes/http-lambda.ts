import { createApp } from "../app.ts";
import { readRuntimeConfig, type RuntimeConfig } from "./config.ts";
import { createRuntimeDependencies } from "./dependencies.ts";
import { handle } from "hono/aws-lambda";

export function createHttpHandler(config: RuntimeConfig) {
    return handle(createApp(createRuntimeDependencies(config).getDb));
}

export const handler = createHttpHandler(readRuntimeConfig(process.env));
