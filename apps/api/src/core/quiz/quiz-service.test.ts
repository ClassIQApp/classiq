import type { IndexedPassage } from "../content-index/model.ts";
import { QuizError } from "./errors.ts";
import type { QuizDraft, QuizWithAnswers } from "./model.ts";
import type { NewQuizAttempt, QuizRepository, StoredQuizAttempt } from "./quiz-repository.ts";
import { QuizService } from "./quiz-service.ts";
import { describe, expect, it, vi } from "vitest";

const passage: IndexedPassage = {
    id: "1",
    kind: "transcript",
    courseId: "1",
    lectureId: "2",
    title: "Enzymes",
    content: "Enzymes lower activation energy.",
    startSeconds: 0,
    endSeconds: 10,
};

const generated = {
    title: "Enzymes",
    model: "gpt-test",
    questions: [
        {
            prompt: "What do enzymes lower?",
            choices: ["Activation energy", "Heat"],
            correctChoice: 0,
            explanation: "They lower activation energy.",
            sources: [{ kind: "transcript" as const, lectureId: "2", title: "Enzymes", startSeconds: 0, endSeconds: 10 }],
        },
        {
            prompt: "Are enzymes consumed?",
            choices: ["Yes", "No"],
            correctChoice: 1,
            explanation: "Catalysts are not consumed.",
            sources: [{ kind: "transcript" as const, lectureId: "2", title: "Enzymes", startSeconds: 0, endSeconds: 10 }],
        },
    ],
};

function fixture({ passages = [passage], scope = true } = {}) {
    const quizzes = new Map<string, QuizWithAnswers>();
    const attempts: StoredQuizAttempt[] = [];
    const repository = {
        scopeExists: vi.fn(async () => scope),
        createQuiz: vi.fn(async (draft: QuizDraft) => {
            const quiz: QuizWithAnswers = {
                id: "10",
                courseId: draft.courseId,
                ...(draft.lectureId === undefined ? {} : { lectureId: draft.lectureId }),
                title: draft.title,
                questionCount: draft.questions.length,
                createdAt: "2026-10-27T00:00:00.000Z",
                questions: draft.questions.map((question, position) => ({ ...question, id: String(100 + position), position })),
            };

            quizzes.set(`${quiz.courseId}/${quiz.id}`, quiz);

            return quiz;
        }),
        listQuizzes: vi.fn(async () => []),
        getQuiz: vi.fn(async (courseId: string, quizId: string) => quizzes.get(`${courseId}/${quizId}`)),
        createAttempt: vi.fn(async (attempt: NewQuizAttempt) => {
            const stored: StoredQuizAttempt = {
                id: "50",
                quizId: attempt.quizId,
                userId: attempt.userId,
                score: attempt.score,
                total: attempt.total,
                submittedAt: "2026-10-27T01:00:00.000Z",
                selectedChoices: new Map(attempt.answers.map((answer) => [answer.questionId, answer.selectedChoice])),
            };

            attempts.push(stored);

            return stored;
        }),
        getAttempt: vi.fn(async (_courseId: string, _quizId: string, attemptId: string, userId: string) =>
            attempts.find((attempt) => attempt.id === attemptId && attempt.userId === userId),
        ),
        listAttempts: vi.fn(async () => []),
    } satisfies QuizRepository;
    const content = { listPassages: vi.fn(async () => passages) };
    const generator = { generate: vi.fn(async () => generated) };

    return { repository, content, generator, service: new QuizService(repository, content, generator) };
}

async function codeOf(promise: Promise<unknown>) {
    const error = await promise.then(
        () => undefined,
        (error: unknown) => error,
    );

    expect(error).toBeInstanceOf(QuizError);

    return (error as QuizError).code;
}

describe("QuizService", () => {
    it("generates a lecture quiz from its indexed passages and stores it", async () => {
        const { service, content, generator, repository } = fixture();

        const quiz = await service.generateQuiz({ courseId: "1", lectureId: "2", createdByUserId: "9" });

        expect(quiz).toEqual({
            id: "10",
            courseId: "1",
            lectureId: "2",
            title: "Enzymes",
            questionCount: 2,
            createdAt: "2026-10-27T00:00:00.000Z",
        });
        expect(quiz).not.toHaveProperty("questions");
        expect(content.listPassages).toHaveBeenCalledWith({ courseId: "1", lectureId: "2" });
        expect(generator.generate).toHaveBeenCalledWith([passage], 5, {});
        expect(repository.createQuiz).toHaveBeenCalledWith(
            expect.objectContaining({ courseId: "1", lectureId: "2", createdByUserId: "9", model: "gpt-test" }),
        );
    });

    it("generates course-wide quizzes", async () => {
        const { service, content } = fixture();

        await service.generateQuiz({ courseId: "1", questionCount: 3 });

        expect(content.listPassages).toHaveBeenCalledWith({ courseId: "1" });
    });

    it("reports a missing course or lecture before calling the LLM", async () => {
        const { service, generator } = fixture({ scope: false });

        expect(await codeOf(service.generateQuiz({ courseId: "1", lectureId: "99" }))).toBe("not_found");
        expect(generator.generate).not.toHaveBeenCalled();
    });

    it("reports when there is no indexed content yet", async () => {
        const { service, generator } = fixture({ passages: [] });

        expect(await codeOf(service.generateQuiz({ courseId: "1" }))).toBe("no_content");
        expect(generator.generate).not.toHaveBeenCalled();
    });

    it.each([
        { courseId: "x" },
        { courseId: "1", questionCount: 2 },
        { courseId: "1", questionCount: 16 },
        { courseId: "1", lectureId: "0" },
    ])("rejects invalid generation request %o", async (request) => {
        const { service } = fixture();

        expect(await codeOf(service.generateQuiz(request))).toBe("invalid_request");
    });

    it("hides answers, explanations, and sources before submission", async () => {
        const { service } = fixture();

        await service.generateQuiz({ courseId: "1" });

        const quiz = await service.getQuiz("1", "10");

        expect(quiz.questions).toEqual([
            { id: "100", position: 0, prompt: "What do enzymes lower?", choices: ["Activation energy", "Heat"] },
            { id: "101", position: 1, prompt: "Are enzymes consumed?", choices: ["Yes", "No"] },
        ]);
    });

    it("never returns another course's quiz", async () => {
        const { service } = fixture();

        await service.generateQuiz({ courseId: "1" });

        expect(await codeOf(service.getQuiz("2", "10"))).toBe("not_found");
    });

    it("scores and stores an attempt, recording unanswered questions", async () => {
        const { service, repository } = fixture();

        await service.generateQuiz({ courseId: "1" });

        const result = await service.submitAttempt("1", "10", "9", { answers: [{ questionId: "100", choice: 0 }] });

        expect(result).toMatchObject({ id: "50", quizId: "10", userId: "9", score: 1, total: 2 });
        expect(result.questions.map((question) => question.outcome)).toEqual(["correct", "unanswered"]);
        expect(result.questions[1]).toMatchObject({ correctChoice: 1, explanation: "Catalysts are not consumed." });
        expect(repository.createAttempt).toHaveBeenCalledWith(
            expect.objectContaining({
                answers: [
                    { questionId: "100", selectedChoice: 0 },
                    { questionId: "101", selectedChoice: null },
                ],
            }),
        );
    });

    it.each([
        ["a malformed body", "not json"],
        ["a negative choice", { answers: [{ questionId: "100", choice: -1 }] }],
        ["a question from another quiz", { answers: [{ questionId: "999", choice: 0 }] }],
        ["a choice that does not exist", { answers: [{ questionId: "100", choice: 2 }] }],
    ])("rejects %s without storing anything", async (_, submission) => {
        const { service, repository } = fixture();

        await service.generateQuiz({ courseId: "1" });

        expect(await codeOf(service.submitAttempt("1", "10", "9", submission))).toBe("invalid_attempt");
        expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it("returns a stored attempt's review only to its owner", async () => {
        const { service } = fixture();

        await service.generateQuiz({ courseId: "1" });
        await service.submitAttempt("1", "10", "9", { answers: [{ questionId: "101", choice: 0 }] });

        const review = await service.getAttempt("1", "10", "50", "9");

        expect(review).toMatchObject({ score: 0, total: 2 });
        expect(review.questions.map((question) => [question.selectedChoice, question.outcome])).toEqual([
            [null, "unanswered"],
            [0, "incorrect"],
        ]);
        expect(await codeOf(service.getAttempt("1", "10", "50", "8"))).toBe("not_found");
    });
});
