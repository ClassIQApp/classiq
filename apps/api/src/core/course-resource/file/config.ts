import { CourseResourceFileError } from "./errors.ts";
import * as z from "zod/mini";

export const courseResourceFileConfigSchema = z.strictObject({
    bucketName: z.string().check(z.trim(), z.minLength(1)),
    region: z.string().check(z.trim(), z.minLength(1)),
});
export type CourseResourceFileConfig = z.infer<typeof courseResourceFileConfigSchema>;

export interface CourseResourceFileEnvironment {
    COURSE_RESOURCE_FILES_BUCKET_NAME?: string;
    AWS_REGION?: string;
}

export function readCourseResourceFileConfig(environment: Readonly<CourseResourceFileEnvironment>): CourseResourceFileConfig {
    const config = courseResourceFileConfigSchema.safeParse({
        bucketName: environment.COURSE_RESOURCE_FILES_BUCKET_NAME,
        region: environment.AWS_REGION,
    });

    if (!config.success) {
        throw new CourseResourceFileError("invalid_configuration");
    }

    return config.data;
}
