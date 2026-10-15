import type { LlmEnvironment } from "./core/ai/config.ts";

declare global {
    namespace NodeJS {
        interface ProcessEnv extends LlmEnvironment {
            DATABASE_URL?: string;
        }
    }
}
