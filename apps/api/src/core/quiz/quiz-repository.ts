import type { QuizAttemptSummary, QuizDraft, QuizSummary, QuizWithAnswers } from "./model.ts";

export interface NewQuizAttempt {
    readonly courseId: string;
    readonly quizId: string;
    readonly userId: string;
    readonly score: number;
    readonly total: number;
    readonly answers: readonly { readonly questionId: string; readonly selectedChoice: number | null }[];
}

export interface StoredQuizAttempt extends QuizAttemptSummary {
    readonly userId: string;
    readonly selectedChoices: ReadonlyMap<string, number | null>;
}

/** Every method is scoped to a course; quizzes, attempts, and lectures of other courses are never visible. */
export interface QuizRepository {
    scopeExists(courseId: string, lectureId?: string): Promise<boolean>;

    createQuiz(draft: QuizDraft): Promise<QuizWithAnswers>;

    listQuizzes(courseId: string, lectureId?: string): Promise<QuizSummary[]>;

    getQuiz(courseId: string, quizId: string): Promise<QuizWithAnswers | undefined>;

    createAttempt(attempt: NewQuizAttempt): Promise<StoredQuizAttempt>;

    getAttempt(courseId: string, quizId: string, attemptId: string, userId: string): Promise<StoredQuizAttempt | undefined>;

    listAttempts(courseId: string, quizId: string, userId: string): Promise<QuizAttemptSummary[]>;
}
