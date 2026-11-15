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

export const generatedAnswerSchema = z.strictObject({
    answerable: z.boolean(),
    answer: z.string(),
    sourceIds: z.array(z.string()),
});
export type GeneratedAnswer = z.infer<typeof generatedAnswerSchema>;

export interface QuestionSource extends ContentLocation {
    readonly kind: ContentSourceKind;
    readonly lectureId?: string;
    readonly resourceId?: string;
    readonly title: string;
}

export interface AnswerContext {
    readonly passages: number;
    readonly characters: number;
}

export interface CourseAnswer {
    readonly answerable: boolean;
    readonly answer: string;
    readonly sources: readonly QuestionSource[];
    readonly context: AnswerContext;
    readonly model?: string;
}
