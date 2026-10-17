import type { LlmEnvironment } from "./core/ai/config.ts";
import type { CourseResourceFileEnvironment } from "./core/course-resource/file/config.ts";

declare global {
    namespace NodeJS {
        interface ProcessEnv extends CourseResourceFileEnvironment, LlmEnvironment {
            DATABASE_URL?: string;
        }
    }
}
