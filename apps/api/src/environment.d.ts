import type { CourseResourceFileEnvironment } from "./core/course-resource/file/config.ts";

declare global {
    namespace NodeJS {
        interface ProcessEnv extends CourseResourceFileEnvironment {
            DATABASE_URL?: string;
        }
    }
}
