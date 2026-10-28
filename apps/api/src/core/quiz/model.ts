import type { ContentLocation, ContentSourceKind } from "../content-index/model.ts";
import * as z from "zod/mini";

const id = z.string().check(z.regex(/^[1-9]\d{0,9}$/));

export const MIN_CHOICES = 2;
export const MAX_CHOICES = 6;

export const quizGenerationRequestSchema = z.strictObject({
    courseId: id,
    lectureId: z.optional(id),
    questionCount: z._default(z.int().check(z.minimum(3), z.maximum(15)), 5),
    createdByUserId: z.optional(id),
});
export type QuizGenerationRequest = z.input<typeof quizGenerationRequestSchema>;

export const attemptSubmissionSchema = z.strictObject({
    answers: z.array(
        z.strictObject({
            questionId: id,
            choice: z.nullable(z.int().check(z.minimum(0))),
        }),
    ),
});
export type AttemptSubmission = z.infer<typeof attemptSubmissionSchema>;
export type AttemptAnswer = AttemptSubmission["answers"][number];

/**
 * What the LLM must return. Kept free of optional fields and numeric constraints so providers'
 * strict structured-output modes accept it; the generator enforces the real constraints.
 */
export const generatedQuizSchema = z.strictObject({
    title: z.string(),
    questions: z.array(
        z.strictObject({
            prompt: z.string(),
            choices: z.array(z.string()),
            correctChoice: z.number(),
            explanation: z.string(),
            sourceIds: z.array(z.string()),
        }),
    ),
});
export type GeneratedQuiz = z.infer<typeof generatedQuizSchema>;

/** Where a question came from, copied at generation time so it outlives re-indexing. */
export interface QuizSource extends ContentLocation {
    readonly kind: ContentSourceKind;
    readonly lectureId?: string;
    readonly resourceId?: string;
    readonly title: string;
}

export interface QuizQuestionDraft {
    readonly prompt: string;
    readonly choices: readonly string[];
    readonly correctChoice: number;
    readonly explanation: string;
    readonly sources: readonly QuizSource[];
}

export interface QuizDraft {
    readonly courseId: string;
    readonly lectureId?: string;
    readonly title: string;
    readonly model: string;
    readonly createdByUserId?: string;
    readonly questions: readonly QuizQuestionDraft[];
}

export interface QuizSummary {
    readonly id: string;
    readonly courseId: string;
    readonly lectureId?: string;
    readonly title: string;
    readonly questionCount: number;
    readonly createdAt: string;
}

/** A question as students see it before submitting: no answer, explanation, or sources. */
export interface QuizQuestion {
    readonly id: string;
    readonly position: number;
    readonly prompt: string;
    readonly choices: readonly string[];
}

export interface AnsweredQuizQuestion extends QuizQuestion {
    readonly correctChoice: number;
    readonly explanation: string;
    readonly sources: readonly QuizSource[];
}

export interface Quiz extends QuizSummary {
    readonly questions: readonly QuizQuestion[];
}

export interface QuizWithAnswers extends QuizSummary {
    readonly questions: readonly AnsweredQuizQuestion[];
}

export type QuestionOutcome = "correct" | "incorrect" | "unanswered";

export interface QuestionResult extends AnsweredQuizQuestion {
    readonly selectedChoice: number | null;
    readonly outcome: QuestionOutcome;
}

export interface ScoredAttempt {
    readonly score: number;
    readonly total: number;
    readonly questions: readonly QuestionResult[];
}

export interface QuizAttemptResult extends ScoredAttempt {
    readonly id: string;
    readonly quizId: string;
    readonly userId: string;
    readonly submittedAt: string;
}

export interface QuizAttemptSummary {
    readonly id: string;
    readonly quizId: string;
    readonly score: number;
    readonly total: number;
    readonly submittedAt: string;
}
