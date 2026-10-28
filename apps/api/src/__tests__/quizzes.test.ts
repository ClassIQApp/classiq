import { createApp } from "../app.ts";
import { LlmError } from "../core/ai/errors.ts";
import type { IndexedPassage } from "../core/content-index/model.ts";
import { QuizError } from "../core/quiz/errors.ts";
import type { QuizWithAnswers } from "../core/quiz/model.ts";
import type { NewQuizAttempt, QuizRepository } from "../core/quiz/quiz-repository.ts";
import { QuizService } from "../core/quiz/quiz-service.ts";
import { createQuizRoutes } from "../routes/quizzes/index.ts";
import { Hono, type MiddlewareHandler } from "hono";
import { describe, expect, it, vi } from "vitest";

const quiz: QuizWithAnswers = {
    id: "10",
    courseId: "1",
    lectureId: "2",
    title: "Enzymes",
    questionCount: 1,
    createdAt: "2026-10-27T00:00:00.000Z",
    questions: [
        {
            id: "100",
            position: 0,
            prompt: "What do enzymes lower?",
            choices: ["Activation energy", "Heat"],
            correctChoice: 0,
            explanation: "They lower activation energy.",
            sources: [{ kind: "transcript", lectureId: "2", title: "Enzymes", startSeconds: 0, endSeconds: 10 }],
        },
    ],
};

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

const requireTestRole =
    (role: "member" | "teacher"): MiddlewareHandler =>
    async (c, next) => {
        const granted = c.req.header("test-role");

        if (!granted) {
            return c.json({ code: "UNAUTHENTICATED", message: "Sign in" }, 401);
        }

        if (granted !== "teacher" && !(role === "member" && granted === "member")) {
            return c.json({ code: "FORBIDDEN", message: "Insufficient role" }, 403);
        }

        await next();
    };

function fixture(generate = vi.fn(async () => ({ title: quiz.title, model: "gpt-test", questions: quiz.questions }))) {
    const repository = {
        scopeExists: vi.fn(async () => true),
        createQuiz: vi.fn(async () => quiz),
        listQuizzes: vi.fn(async () => [quiz]),
        getQuiz: vi.fn(async (courseId: string, quizId: string) => (courseId === "1" && quizId === "10" ? quiz : undefined)),
        createAttempt: vi.fn(async (attempt: NewQuizAttempt) => ({
            id: "50",
            quizId: attempt.quizId,
            userId: attempt.userId,
            score: attempt.score,
            total: attempt.total,
            submittedAt: "2026-10-27T01:00:00.000Z",
            selectedChoices: new Map(attempt.answers.map((answer) => [answer.questionId, answer.selectedChoice])),
        })),
        getAttempt: vi.fn(async () => undefined),
        listAttempts: vi.fn(async () => []),
    } satisfies QuizRepository;
    const service = new QuizService(repository, { listPassages: vi.fn(async () => [passage]) }, { generate });
    const app = new Hono().route(
        "/courses",
        createQuizRoutes({
            getService: () => service,
            requireCourseRole: requireTestRole,
            getUserId: (c) => c.req.header("test-user") ?? "9",
        }),
    );

    function request(method: string, path: string, body?: unknown, role = "member") {
        return app.request(`/courses/${path}`, {
            method,
            headers: { "content-type": "application/json", "test-role": role },
            ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
        });
    }

    return { repository, generate, request };
}

describe("quiz router", () => {
    it("mounts quiz endpoints behind sessions without building the quiz service for anonymous requests", async () => {
        const app = createApp(
            () => {
                throw new Error("Database must not be accessed");
            },
            { getAuth: () => ({ handler: async () => new Response(), api: { getSession: async () => null } }) },
        );

        const generateResponse = await app.request("/courses/1/quizzes", { method: "POST" });
        const attemptResponse = await app.request("/courses/1/quizzes/10/attempts", { method: "POST" });

        expect(generateResponse.status).toBe(401);
        expect(attemptResponse.status).toBe(401);
    });

    it("requires injected authorization and user lookup at construction", () => {
        const service = new QuizService(fixture().repository, { listPassages: vi.fn() }, { generate: vi.fn() });

        expect(() => createQuizRoutes({ getService: () => service, requireCourseRole: undefined!, getUserId: () => "1" })).toThrow(
            "authorization",
        );
        expect(() => createQuizRoutes({ getService: () => service, requireCourseRole: requireTestRole, getUserId: undefined! })).toThrow(
            "authorization",
        );
    });

    it("lets teachers generate quizzes but not members", async () => {
        const { request, generate } = fixture();

        const memberResponse = await request("POST", "1/quizzes", { lectureId: "2" });
        const teacherResponse = await request("POST", "1/quizzes", { lectureId: "2", questionCount: 3 }, "teacher");

        expect(memberResponse.status).toBe(403);
        expect(teacherResponse.status).toBe(201);
        expect(await teacherResponse.json()).toMatchObject({ id: "10", title: "Enzymes", questionCount: 1 });
        expect(generate).toHaveBeenCalledTimes(1);
        expect(generate.mock.calls[0]).toEqual([expect.any(Array), 3, expect.objectContaining({ signal: expect.any(AbortSignal) })]);
    });

    it.each([
        ["", 401],
        ["unrelated", 403],
    ])("denies role %j on every quiz endpoint", async (role, status) => {
        const { request, repository } = fixture();

        const responses = await Promise.all([
            request("GET", "1/quizzes", undefined, role),
            request("GET", "1/quizzes/10", undefined, role),
            request("POST", "1/quizzes/10/attempts", { answers: [] }, role),
            request("GET", "1/quizzes/10/attempts", undefined, role),
            request("GET", "1/quizzes/10/attempts/50", undefined, role),
        ]);

        expect(responses.map((response) => response.status)).toEqual([status, status, status, status, status]);
        expect(repository.getQuiz).not.toHaveBeenCalled();
    });

    it("hides answers until a member submits, then returns the review", async () => {
        const { request, repository } = fixture();

        const quizResponse = await request("GET", "1/quizzes/10");
        const quizBody = await quizResponse.json();

        expect(quizResponse.headers.get("cache-control")).toBe("private, no-store");
        expect(JSON.stringify(quizBody)).not.toMatch(/correctChoice|explanation|sources/);

        const attemptResponse = await request("POST", "1/quizzes/10/attempts", { answers: [{ questionId: "100", choice: 1 }] });

        expect(attemptResponse.status).toBe(201);
        expect(await attemptResponse.json()).toMatchObject({
            score: 0,
            total: 1,
            questions: [{ selectedChoice: 1, correctChoice: 0, outcome: "incorrect", explanation: "They lower activation energy." }],
        });
        expect(repository.createAttempt).toHaveBeenCalledWith(expect.objectContaining({ userId: "9" }));
    });

    it("looks up attempts for the signed-in user only", async () => {
        const { repository } = fixture();
        const app = new Hono().route(
            "/courses",
            createQuizRoutes({
                getService: () => new QuizService(repository, { listPassages: vi.fn() }, { generate: vi.fn() }),
                requireCourseRole: requireTestRole,
                getUserId: () => "42",
            }),
        );

        const response = await app.request("/courses/1/quizzes/10/attempts/50", { headers: { "test-role": "member" } });

        expect(response.status).toBe(404);
        expect(repository.getAttempt).toHaveBeenCalledWith("1", "10", "50", "42");
    });

    it.each([
        ["POST", "1/quizzes", "{not json", "teacher", 400, "INVALID_QUIZ_REQUEST"],
        ["POST", "1/quizzes", "null", "teacher", 400, "INVALID_QUIZ_REQUEST"],
        ["POST", "1/quizzes", { questionCount: 50 }, "teacher", 400, "INVALID_QUIZ_REQUEST"],
        ["POST", "1/quizzes", { lectureId: "2", extra: true }, "teacher", 400, "INVALID_QUIZ_REQUEST"],
        ["GET", "1/quizzes/abc", undefined, "member", 400, "INVALID_QUIZ_REQUEST"],
        ["GET", "2/quizzes/10", undefined, "member", 404, "NOT_FOUND"],
        ["POST", "1/quizzes/10/attempts", { answers: [{ questionId: "999", choice: 0 }] }, "member", 400, "INVALID_ATTEMPT"],
        ["POST", "1/quizzes/10/attempts", { answers: "all" }, "member", 400, "INVALID_ATTEMPT"],
    ])("maps %s %s with %j to %i", async (method, path, body, role, status, code) => {
        const { request } = fixture();

        const response = await request(method, path, body, role);

        expect(response.status).toBe(status);
        expect(await response.json()).toMatchObject({ code });
    });

    it.each([
        [new QuizError("no_content"), 409, "NO_CONTENT"],
        [new QuizError("generation_failed"), 502, "GENERATION_FAILED"],
        [new LlmError("provider_error"), 502, "GENERATION_FAILED"],
        [new LlmError("timeout"), 504, "GENERATION_TIMEOUT"],
        [new Error("connect ECONNREFUSED 10.0.0.1"), 503, "QUIZ_UNAVAILABLE"],
    ])("maps generation failure %o", async (error, status, code) => {
        const { request } = fixture(
            vi.fn(async () => {
                throw error;
            }),
        );

        const response = await request("POST", "1/quizzes", {}, "teacher");
        const text = await response.text();

        expect(response.status).toBe(status);
        expect(JSON.parse(text)).toMatchObject({ code });
        expect(text).not.toContain("10.0.0.1");
    });
});
