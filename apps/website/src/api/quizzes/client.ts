import type { ApiFetch } from "../auth/client";

export interface QuizSource {
    kind: "transcript" | "resource";
    lectureId?: string;
    resourceId?: string;
    title: string;
    pageNumber?: number;
    startSeconds?: number;
    endSeconds?: number;
}

export interface QuizSummary {
    id: string;
    courseId: string;
    lectureId?: string;
    title: string;
    questionCount: number;
    createdAt: string;
}

export interface QuizQuestion {
    id: string;
    position: number;
    prompt: string;
    choices: string[];
}

export interface Quiz extends QuizSummary {
    questions: QuizQuestion[];
}

export interface QuizAnswer {
    questionId: string;
    choice: number | null;
}

export type QuestionOutcome = "correct" | "incorrect" | "unanswered";

export interface QuestionResult extends QuizQuestion {
    correctChoice: number;
    explanation: string;
    sources: QuizSource[];
    selectedChoice: number | null;
    outcome: QuestionOutcome;
}

export interface QuizAttemptSummary {
    id: string;
    quizId: string;
    score: number;
    total: number;
    submittedAt: string;
}

export interface QuizAttemptResult extends QuizAttemptSummary {
    userId: string;
    questions: QuestionResult[];
}

export const quizzesQueryKey = (accountId: string, courseId: string) => ["accounts", accountId, "courses", courseId, "quizzes"] as const;

export const quizQueryKey = (accountId: string, courseId: string, quizId: string) =>
    [...quizzesQueryKey(accountId, courseId), quizId] as const;

export const quizAttemptsQueryKey = (accountId: string, courseId: string, quizId: string) =>
    [...quizQueryKey(accountId, courseId, quizId), "attempts"] as const;

export const quizAttemptQueryKey = (accountId: string, courseId: string, quizId: string, attemptId: string) =>
    [...quizAttemptsQueryKey(accountId, courseId, quizId), attemptId] as const;

const root = (courseId: string) => `/courses/${encodeURIComponent(courseId)}/quizzes`;

const quizRoot = (courseId: string, quizId: string) => `${root(courseId)}/${encodeURIComponent(quizId)}`;

export function createQuizzesApi(request: ApiFetch) {
    async function list(courseId: string, signal?: AbortSignal): Promise<QuizSummary[]> {
        const response = await request(root(courseId), { signal });
        const data: { items: QuizSummary[] } = await response.json();

        return data.items;
    }

    async function get(courseId: string, quizId: string, signal?: AbortSignal): Promise<Quiz> {
        const response = await request(quizRoot(courseId, quizId), { signal });

        return response.json();
    }

    async function generate(
        courseId: string,
        lectureId: string | undefined,
        questionCount: number,
        signal?: AbortSignal,
    ): Promise<QuizSummary> {
        const response = await request(root(courseId), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...(lectureId === undefined ? {} : { lectureId }), questionCount }),
            signal,
        });

        return response.json();
    }

    async function submit(courseId: string, quizId: string, answers: QuizAnswer[], signal?: AbortSignal): Promise<QuizAttemptResult> {
        const response = await request(`${quizRoot(courseId, quizId)}/attempts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answers }),
            signal,
        });

        return response.json();
    }

    async function listAttempts(courseId: string, quizId: string, signal?: AbortSignal): Promise<QuizAttemptSummary[]> {
        const response = await request(`${quizRoot(courseId, quizId)}/attempts`, { signal });
        const data: { items: QuizAttemptSummary[] } = await response.json();

        return data.items;
    }

    async function getAttempt(courseId: string, quizId: string, attemptId: string, signal?: AbortSignal): Promise<QuizAttemptResult> {
        const response = await request(`${quizRoot(courseId, quizId)}/attempts/${encodeURIComponent(attemptId)}`, { signal });

        return response.json();
    }

    return { list, get, generate, submit, listAttempts, getAttempt };
}
