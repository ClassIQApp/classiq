import * as z from "zod/mini";

const text = z.string().check(z.refine((value) => value.trim().length > 0));
export const summarySchema = z.object({ text });
export const keyTermsSchema = z.object({
    terms: z
        .array(
            z.object({
                term: text,
                explanation: text,
                sources: z
                    .array(
                        z.object({
                            startSeconds: z.number().check(z.nonnegative()),
                            endSeconds: z.number().check(z.nonnegative()),
                        }),
                    )
                    .check(z.minLength(1)),
            }),
        )
        .check(z.minLength(1)),
});
export type ContentKind = "summary" | "key_terms";
export interface LectureReference {
    readonly courseId: string;
    readonly lectureId: string;
}
export type GeneratedContent =
    { kind: "summary"; content: z.infer<typeof summarySchema> } | { kind: "key_terms"; content: z.infer<typeof keyTermsSchema> };
export type StoredContent = GeneratedContent & { sourceHash: string; provider: string; model: string };
export interface LectureContentRepository {
    read(reference: LectureReference, kind: ContentKind): Promise<StoredContent | undefined>;
    save(reference: LectureReference, output: StoredContent): Promise<void>;
}
