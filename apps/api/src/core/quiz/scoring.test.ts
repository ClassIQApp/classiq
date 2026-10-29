import { QuizError } from "./errors.ts";
import type { AnsweredQuizQuestion } from "./model.ts";
import { scoreAttempt } from "./scoring.ts";
import { describe, expect, it } from "vitest";

const questions: AnsweredQuizQuestion[] = ["1", "2", "3"].map((id, position) => ({
    id,
    position,
    prompt: `Question ${id}`,
    choices: ["A", "B", "C", "D"],
    correctChoice: position,
    explanation: `Because ${id}`,
    sources: [{ kind: "transcript", lectureId: "7", title: "Enzymes", startSeconds: 0, endSeconds: 10 }],
}));

describe("scoreAttempt", () => {
    it("marks correct, incorrect, and unanswered questions", () => {
        const result = scoreAttempt(questions, [
            { questionId: "1", choice: 0 },
            { questionId: "2", choice: 3 },
            { questionId: "3", choice: null },
        ]);

        expect(result.score).toBe(1);
        expect(result.total).toBe(3);
        expect(result.questions.map((question) => [question.id, question.selectedChoice, question.outcome])).toEqual([
            ["1", 0, "correct"],
            ["2", 3, "incorrect"],
            ["3", null, "unanswered"],
        ]);
    });

    it("treats omitted questions as unanswered and keeps quiz order", () => {
        const result = scoreAttempt(questions, [{ questionId: "3", choice: 2 }]);

        expect(result.score).toBe(1);
        expect(result.questions.map((question) => question.outcome)).toEqual(["unanswered", "unanswered", "correct"]);
    });

    it("returns the answer key, explanation, and sources for review", () => {
        const [first] = scoreAttempt(questions, []).questions;

        expect(first).toMatchObject({ correctChoice: 0, explanation: "Because 1", sources: questions[0]!.sources });
    });

    it.each([
        ["an unknown question", [{ questionId: "99", choice: 0 }]],
        [
            "a repeated question",
            [
                { questionId: "1", choice: 0 },
                { questionId: "1", choice: 1 },
            ],
        ],
        ["a choice that does not exist", [{ questionId: "1", choice: 4 }]],
    ])("rejects %s", (_, answers) => {
        expect(() => scoreAttempt(questions, answers)).toThrow(QuizError);
    });
});
