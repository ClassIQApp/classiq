import { LlmError } from "../ai/errors.ts";
import { LlmService } from "../ai/llm-service.ts";
import type { IndexedPassage } from "../content-index/model.ts";
import { QuizError } from "./errors.ts";
import type { GeneratedQuiz } from "./model.ts";
import { QuizGenerator, selectPassages, type QuizLlm } from "./quiz-generator.ts";
import { describe, expect, it, vi } from "vitest";

const passages: IndexedPassage[] = [
    {
        id: "1",
        kind: "transcript",
        courseId: "1",
        lectureId: "7",
        title: "Enzymes",
        content: "Enzymes lower activation energy.",
        startSeconds: 0,
        endSeconds: 42,
    },
    {
        id: "2",
        kind: "resource",
        courseId: "1",
        resourceId: "3",
        lectureId: "7",
        title: "notes.pdf",
        content: "Inhibitors bind active sites.",
        pageNumber: 4,
    },
];

type GeneratedQuestion = GeneratedQuiz["questions"][number];

function question(overrides: Partial<GeneratedQuestion> = {}): GeneratedQuestion {
    return {
        prompt: "What do enzymes lower?",
        choices: ["Activation energy", "Temperature", "Pressure", "Volume"],
        correctChoice: 0,
        explanation: "Enzymes lower the activation energy of reactions.",
        sourceIds: ["S1"],
        ...overrides,
    };
}

function fixture(questions: GeneratedQuestion[], random = () => 0.5) {
    const llm = {
        generateStructured: vi.fn<QuizLlm["generateStructured"]>(async () => ({
            model: "gpt-test",
            data: { title: "  Enzymes quiz  ", questions },
        })),
    };

    return { llm, generator: new QuizGenerator(llm, { random }) };
}

describe("QuizGenerator", () => {
    it("returns grounded questions with source snapshots and the model used", async () => {
        const { generator } = fixture([question(), question({ prompt: "What binds active sites?", sourceIds: ["[S2]", "S1"] })]);

        const quiz = await generator.generate(passages, 2);

        expect(quiz.title).toBe("Enzymes quiz");
        expect(quiz.model).toBe("gpt-test");
        expect(quiz.questions).toHaveLength(2);
        expect(quiz.questions[0]!.sources).toEqual([
            { kind: "transcript", lectureId: "7", title: "Enzymes", startSeconds: 0, endSeconds: 42 },
        ]);
        expect(quiz.questions[1]!.sources).toEqual([
            { kind: "resource", resourceId: "3", lectureId: "7", title: "notes.pdf", pageNumber: 4 },
            expect.objectContaining({ kind: "transcript" }),
        ]);
    });

    it("labels passages as reference material and asks for the requested count", async () => {
        const { llm, generator } = fixture([question()]);

        await generator.generate(passages, 1);

        const [request] = llm.generateStructured.mock.calls[0]!;
        const [system, user] = request.messages.map((message) => message.content);

        expect(system).toMatch(/not instructions/);
        expect(system).toMatch(/Write 1 questions/);
        expect(user).toContain("[S1] Enzymes (0:00–0:42)\nEnzymes lower activation energy.");
        expect(user).toContain("[S2] notes.pdf (page 4)");
    });

    it("shuffles choices while keeping the correct answer", async () => {
        const keys = [0.9, 0.1, 0.5, 0.3];
        const { generator } = fixture([question()], () => keys.shift()!);

        const { questions } = await generator.generate(passages, 1);
        const [shuffled] = questions;

        expect(shuffled!.choices).toEqual(["Temperature", "Volume", "Pressure", "Activation energy"]);
        expect(shuffled!.choices[shuffled!.correctChoice]).toBe("Activation energy");
    });

    it.each([
        ["an empty prompt", { prompt: " " }],
        ["too few choices", { choices: ["Only one"] }],
        ["duplicate choices", { choices: ["Yes", "yes", "No", "Maybe"] }],
        ["an empty choice", { choices: ["A", "", "C", "D"] }],
        ["a fractional answer index", { correctChoice: 0.5 }],
        ["an out-of-range answer index", { correctChoice: 4 }],
        ["a missing explanation", { explanation: "" }],
        ["no sources", { sourceIds: [] }],
        ["only unknown sources", { sourceIds: ["S9", "page 3"] }],
    ])("drops questions with %s", async (_, overrides) => {
        const { generator } = fixture([question({ prompt: "Kept question?" }), question({ prompt: "Dropped?", ...overrides })]);

        const quiz = await generator.generate(passages, 2);

        expect(quiz.questions.map((kept) => kept.prompt)).toEqual(["Kept question?"]);
    });

    it("drops duplicate prompts and truncates extra questions", async () => {
        const { generator } = fixture([
            question({ prompt: "One?" }),
            question({ prompt: "one?" }),
            question({ prompt: "Two?" }),
            question({ prompt: "Three?" }),
            question({ prompt: "Four?" }),
        ]);

        const quiz = await generator.generate(passages, 3);

        expect(quiz.questions.map((kept) => kept.prompt)).toEqual(["One?", "Two?", "Three?"]);
    });

    it("fails when fewer than half of the requested questions are usable", async () => {
        const { generator } = fixture([question(), question({ prompt: "Bad?", sourceIds: [] })]);

        await expect(generator.generate(passages, 5)).rejects.toEqual(new QuizError("generation_failed"));
    });

    it("propagates LLM failures", async () => {
        const { llm, generator } = fixture([]);

        llm.generateStructured.mockRejectedValueOnce(new LlmError("timeout"));

        await expect(generator.generate(passages, 3)).rejects.toBeInstanceOf(LlmError);
    });

    it("falls back to a default title", async () => {
        const { llm, generator } = fixture([question()]);

        llm.generateStructured.mockResolvedValueOnce({ model: "m", data: { title: " ", questions: [question()] } });

        const quiz = await generator.generate(passages, 1);

        expect(quiz.title).toBe("Practice quiz");
    });
});

describe("selectPassages", () => {
    const many = Array.from({ length: 10 }, (_, index) => ({ ...passages[0]!, id: String(index), content: "x".repeat(100) }));

    it("keeps everything that fits", () => {
        expect(selectPassages(many, 1000)).toHaveLength(10);
    });

    it("samples evenly across long material within the budget", () => {
        const selected = selectPassages(many, 500);

        expect(selected.map((passage) => passage.id)).toEqual(["0", "2", "4", "6", "8"]);
    });

    it("always keeps at least one passage", () => {
        expect(selectPassages(many, 10)).toHaveLength(1);
    });
});

describe("QuizLlm", () => {
    it("is satisfied by LlmService", () => {
        const llm: QuizLlm = new LlmService({ provider: "openai", generate: vi.fn() });

        expect(llm).toBeDefined();
    });
});
