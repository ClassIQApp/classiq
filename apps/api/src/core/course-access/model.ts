import * as z from "zod/mini";

export const courseRoleSchema = z.enum(["teacher", "member"]);
export type CourseRole = z.infer<typeof courseRoleSchema>;

export interface CourseMembership {
    courseId: string;
    userId: string;
    role: CourseRole;
}
