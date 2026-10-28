import { courseRoleSchema } from "../course-access/model.ts";
import * as z from "zod/mini";

const nonemptyText = z.string().check(z.refine((value) => value.trim().length > 0));

export const courseReferenceSchema = nonemptyText;

export const courseRegistrationSchema = z.strictObject({
    code: nonemptyText,
    name: nonemptyText,
    slug: nonemptyText,
    description: z.string(),
});
export type CourseRegistration = z.infer<typeof courseRegistrationSchema>;

export const courseMetadataUpdateSchema = z
    .partial(courseRegistrationSchema)
    .check(z.refine((update) => Object.values(update).some((value) => value !== undefined)));
export type CourseMetadataUpdate = z.infer<typeof courseMetadataUpdateSchema>;

export const courseSchema = z.strictObject({
    id: courseReferenceSchema,
    code: z.nullable(z.string()),
    name: z.string(),
    slug: z.string(),
    description: z.nullable(z.string()),
});
export type Course = z.infer<typeof courseSchema>;

export const memberCourseSchema = z.extend(courseSchema, { role: courseRoleSchema });
export type MemberCourse = z.infer<typeof memberCourseSchema>;
