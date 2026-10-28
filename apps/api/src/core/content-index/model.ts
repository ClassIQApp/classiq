import * as z from "zod/mini";

const id = z.string().check(z.regex(/^[1-9]\d{0,9}$/));

const seconds = z.number().check(z.minimum(0), z.refine(Number.isFinite));

export const contentSourceKindSchema = z.enum(["transcript", "resource"]);
export type ContentSourceKind = z.infer<typeof contentSourceKindSchema>;

export const contentSourceReferenceSchema = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("transcript"), courseId: id, lectureId: id }),
    z.strictObject({ kind: z.literal("resource"), courseId: id, resourceId: id }),
]);
export type ContentSourceReference = z.infer<typeof contentSourceReferenceSchema>;

/** A timed span of a lecture transcript. */
export const transcriptSegmentSchema = z
    .strictObject({
        text: z.string(),
        startSeconds: seconds,
        endSeconds: seconds,
    })
    .check(z.refine((segment) => segment.endSeconds >= segment.startSeconds));
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

/** The extracted text of one page of a course resource. */
export const resourcePageSchema = z.strictObject({
    text: z.string(),
    pageNumber: z.int().check(z.positive()),
});
export type ResourcePage = z.infer<typeof resourcePageSchema>;

export type ContentSection = TranscriptSegment | ResourcePage;

export interface ContentLocation {
    readonly pageNumber?: number;
    readonly startSeconds?: number;
    readonly endSeconds?: number;
}

export interface ContentChunk extends ContentLocation {
    readonly position: number;
    readonly content: string;
}

export type ContentSourceStatus = "indexed" | "failed";

export interface ContentSource {
    readonly id: string;
    readonly reference: ContentSourceReference;
    readonly status: ContentSourceStatus;
    readonly statusMessage: string;
    readonly contentHash?: string;
    readonly chunkCount: number;
    readonly indexedAt?: string;
}

export const contentSearchQuerySchema = z.strictObject({
    courseId: id,
    text: z.string().check(z.trim(), z.minLength(1), z.maxLength(500)),
    lectureId: z.optional(id),
    kinds: z.optional(z.array(contentSourceKindSchema).check(z.minLength(1))),
    limit: z._default(z.int().check(z.minimum(1), z.maximum(20)), 8),
});
export type ContentSearchQuery = z.input<typeof contentSearchQuerySchema>;
export type ParsedContentSearchQuery = z.infer<typeof contentSearchQuerySchema>;

export const contentScopeSchema = z.strictObject({
    courseId: id,
    lectureId: z.optional(id),
});
export type ContentScope = z.infer<typeof contentScopeSchema>;

/** An indexed chunk, traceable to the lecture timestamp or resource page it came from. */
export interface IndexedPassage extends ContentLocation {
    readonly id: string;
    readonly kind: ContentSourceKind;
    readonly courseId: string;
    readonly lectureId?: string;
    readonly resourceId?: string;
    readonly title: string;
    readonly content: string;
}

export interface ContentPassage extends IndexedPassage {
    readonly score: number;
}
