import type { LlmEnvironment } from "./core/ai/config.ts";
import type { AuthEnvironment } from "./core/auth/config.ts";
import type { CourseResourceFileEnvironment } from "./core/course-resource/file/config.ts";

declare global {
    namespace NodeJS {
        interface ProcessEnv extends CourseResourceFileEnvironment, LlmEnvironment, AuthEnvironment {
            DATABASE_URL?: string;
        }
    }
}
