import { Readable } from "node:stream";
import * as z from "zod/mini";

const identifierSchema = z.string().check(z.minLength(1));
export const courseResourceFileReferenceSchema = z.discriminatedUnion("kind", [
    z.strictObject({
        kind: z.literal("recording"),
        courseId: identifierSchema,
        lectureId: identifierSchema,
        assetId: identifierSchema,
    }),
    z.strictObject({
        kind: z.literal("resource"),
        courseId: identifierSchema,
        lectureId: z.optional(identifierSchema),
        assetId: identifierSchema,
    }),
]);
export type CourseResourceFileReference = z.infer<typeof courseResourceFileReferenceSchema>;

const MAX_UPLOAD_BYTES = 5 * 1024 ** 3;
export const courseResourceFileUploadSchema = z
    .strictObject({
        body: z.union([z.instanceof(Uint8Array), z.instanceof(Readable)]),
        contentType: z.string().check(z.minLength(1)),
        contentLength: z.int().check(z.minimum(0), z.maximum(MAX_UPLOAD_BYTES)),
    })
    .check(z.refine((upload) => !(upload.body instanceof Uint8Array) || upload.contentLength === upload.body.byteLength));
export type CourseResourceFileUpload = z.infer<typeof courseResourceFileUploadSchema>;

export interface CourseResourceFile {
    readonly reference: CourseResourceFileReference;
    readonly contentType: string;
    readonly contentLength: number | undefined;
}

export interface DownloadedCourseResourceFile extends CourseResourceFile {
    readonly body: Readable;
}
