import * as z from "zod/mini";

const nonemptyText = z.string().check(z.minLength(1));
const contentLengthSchema = z.int().check(z.minimum(0));

export const courseResourceReferenceSchema = z.strictObject({
    courseId: nonemptyText,
    resourceId: nonemptyText,
});
export type CourseResourceReference = z.infer<typeof courseResourceReferenceSchema>;

export const courseResourceRegistrationSchema = z.strictObject({
    name: nonemptyText,
    contentType: nonemptyText,
    contentLength: contentLengthSchema,
});
export type CourseResourceRegistration = z.infer<typeof courseResourceRegistrationSchema>;

export const courseResourceUploadStatusSchema = z.enum(["pending", "uploaded", "failed"]);
export type CourseResourceUploadStatus = z.infer<typeof courseResourceUploadStatusSchema>;

export const courseResourceSchema = z.strictObject({
    id: nonemptyText,
    courseId: nonemptyText,
    name: z.nullable(nonemptyText),
    contentType: z.nullable(nonemptyText),
    contentLength: z.nullable(contentLengthSchema),
    uploadStatus: courseResourceUploadStatusSchema,
});
export type CourseResource = z.infer<typeof courseResourceSchema>;
