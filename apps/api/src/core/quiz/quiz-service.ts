import type { LlmCallOptions } from "../ai/model.ts";
import type { ContentIndexService } from "../content-index/content-index-service.ts";
import { QuizError } from "./errors.ts";
import {
    attemptSubmissionSchema,
    quizGenerationRequestSchema,
    type QuizAttemptResult,
    type QuizAttemptSummary,
    type Quiz,
    type QuizGenerationRequest,
    type QuizSummary,
    type QuizWithAnswers,
} from "./model.ts";
import type { QuizGenerator } from "./quiz-generator.ts";
import type { QuizRepository, StoredQuizAttempt } from "./quiz-repository.ts";
import { scoreAttempt } from "./scoring.ts";
import * as z from "zod/mini";

const idSchema = z.string().check(z.regex(/^[1-9]\d{0,9}$/));

export class QuizService {
    private readonly repository: QuizRepository;
    private readonly content: Pick<ContentIndexService, "listPassages">;
    private readonly generator: Pick<QuizGenerator, "generate">;

    constructor(
        repository: QuizRepository,
        content: Pick<ContentIndexService, "listPassages">,
        generator: Pick<QuizGenerator, "generate">,
    ) {
        this.repository = repository;
        this.content = content;
        this.generator = generator;
    }

    /** Generates and stores a quiz from the indexed content of a lecture, or of the whole course. */
    async generateQuiz(request: QuizGenerationRequest, options: LlmCallOptions = {}): Promise<QuizSummary> {
        const parsed = quizGenerationRequestSchema.safeParse(request);

        if (!parsed.success) {
            throw new QuizError("invalid_request");
        }

        const { courseId, lectureId, questionCount, createdByUserId } = parsed.data;

        if (!(await this.repository.scopeExists(courseId, lectureId))) {
            throw new QuizError("not_found");
        }

        const passages = await this.content.listPassages({ courseId, ...(lectureId === undefined ? {} : { lectureId }) });

        if (passages.length === 0) {
            throw new QuizError("no_content");
        }

        const generated = await this.generator.generate(passages, questionCount, options);
        const quiz = await this.repository.createQuiz({
            courseId,
            ...(lectureId === undefined ? {} : { lectureId }),
            ...(createdByUserId === undefined ? {} : { createdByUserId }),
            ...generated,
        });

        return summarize(quiz);
    }

    async listQuizzes(courseId: string, lectureId?: string): Promise<QuizSummary[]> {
        parseIds(courseId, ...(lectureId === undefined ? [] : [lectureId]));

        return this.repository.listQuizzes(courseId, lectureId);
    }

    /** Returns the quiz as students see it before submitting: no answers, explanations, or sources. */
    async getQuiz(courseId: string, quizId: string): Promise<Quiz> {
        const quiz = await this.findQuiz(courseId, quizId);

        return {
            ...summarize(quiz),
            questions: quiz.questions.map(({ id, position, prompt, choices }) => ({ id, position, prompt, choices })),
        };
    }

    async submitAttempt(courseId: string, quizId: string, userId: string, submission: unknown): Promise<QuizAttemptResult> {
        parseIds(userId);

        const parsed = attemptSubmissionSchema.safeParse(submission);

        if (!parsed.success) {
            throw new QuizError("invalid_attempt");
        }

        const quiz = await this.findQuiz(courseId, quizId);
        const scored = scoreAttempt(quiz.questions, parsed.data.answers);
        const stored = await this.repository.createAttempt({
            courseId,
            quizId,
            userId,
            score: scored.score,
            total: scored.total,
            answers: scored.questions.map((question) => ({ questionId: question.id, selectedChoice: question.selectedChoice })),
        });

        return { ...scored, id: stored.id, quizId: stored.quizId, userId: stored.userId, submittedAt: stored.submittedAt };
    }

    /** Returns one of the user's own attempts with the full answer review. */
    async getAttempt(courseId: string, quizId: string, attemptId: string, userId: string): Promise<QuizAttemptResult> {
        parseIds(attemptId, userId);

        const quiz = await this.findQuiz(courseId, quizId);
        const attempt = await this.repository.getAttempt(courseId, quizId, attemptId, userId);

        if (!attempt) {
            throw new QuizError("not_found");
        }

        return review(quiz, attempt);
    }

    async listAttempts(courseId: string, quizId: string, userId: string): Promise<QuizAttemptSummary[]> {
        parseIds(courseId, quizId, userId);

        return this.repository.listAttempts(courseId, quizId, userId);
    }

    private async findQuiz(courseId: string, quizId: string): Promise<QuizWithAnswers> {
        parseIds(courseId, quizId);

        const quiz = await this.repository.getQuiz(courseId, quizId);

        if (!quiz) {
            throw new QuizError("not_found");
        }

        return quiz;
    }
}

function parseIds(...ids: string[]) {
    if (!ids.every((value) => idSchema.safeParse(value).success)) {
        throw new QuizError("invalid_request");
    }
}

function summarize({ id, courseId, lectureId, title, questionCount, createdAt }: QuizSummary): QuizSummary {
    return { id, courseId, ...(lectureId === undefined ? {} : { lectureId }), title, questionCount, createdAt };
}

function review(quiz: QuizWithAnswers, attempt: StoredQuizAttempt): QuizAttemptResult {
    const scored = scoreAttempt(
        quiz.questions,
        [...attempt.selectedChoices].map(([questionId, choice]) => ({ questionId, choice })),
    );

    return {
        ...scored,
        score: attempt.score,
        total: attempt.total,
        id: attempt.id,
        quizId: attempt.quizId,
        userId: attempt.userId,
        submittedAt: attempt.submittedAt,
    };
}
