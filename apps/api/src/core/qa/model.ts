import type { ContentLocation, ContentSourceKind } from "../content-index/model.ts";
import * as z from "zod/mini";

const id = z.string().check(z.regex(/^[1-9]\d{0,9}$/));

export const MAX_QUESTION_LENGTH = 1000;

export const questionRequestSchema = z.strictObject({
    courseId: id,
    question: z.string().check(z.trim(), z.minLength(1), z.maxLength(MAX_QUESTION_LENGTH)),
    lectureId: z.optional(id),
});
export type QuestionRequest = z.input<typeof questionRequestSchema>;

/** What the LLM must return. Kept free of optional fields so providers' strict structured-output modes accept it. */
export const generatedAnswerSchema = z.strictObject({
    answerable: z.boolean(),
    answer: z.string(),
    sourceIds: z.array(z.string()),
});
export type GeneratedAnswer = z.infer<typeof generatedAnswerSchema>;

/** Where an answer came from, copied at answer time so it outlives re-indexing. */
export interface QuestionSource extends ContentLocation {
    readonly kind: ContentSourceKind;
    readonly lectureId?: string;
    readonly resourceId?: string;
    readonly title: string;
}

export interface CourseAnswer {
    readonly answerable: boolean;
    readonly answer: string;
    readonly sources: readonly QuestionSource[];
    readonly model?: string;
}
