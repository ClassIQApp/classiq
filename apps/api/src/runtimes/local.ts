import { createApp } from "../app.ts";
import { readRuntimeConfig, type RuntimeConfig } from "./config.ts";
import { createRuntimeDependencies } from "./dependencies.ts";

export function createLocalApp(config: RuntimeConfig) {
    return createApp(createRuntimeDependencies(config).getDb);
}

export default createLocalApp(readRuntimeConfig(process.env));
