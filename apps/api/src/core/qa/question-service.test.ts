import type { ContentPassage } from "../content-index/model.ts";
import { QaError } from "./errors.ts";
import type { GeneratedAnswer } from "./model.ts";
import { NO_EVIDENCE_ANSWER, QuestionAnswerer, type AnswerLlm } from "./question-answerer.ts";
import { QuestionService } from "./question-service.ts";
import { toSearchQuery } from "./search-query.ts";
import { describe, expect, it, vi } from "vitest";

const passage: ContentPassage = {
    id: "1",
    kind: "transcript",
    courseId: "1",
    lectureId: "7",
    title: "Enzymes",
    content: "Enzymes lower activation energy.",
    startSeconds: 0,
    endSeconds: 42,
    score: 1,
};

function answerer(data: GeneratedAnswer) {
    const llm: AnswerLlm = { generateStructured: vi.fn(async () => ({ model: "test-model", data })) };

    return new QuestionAnswerer(llm);
}

describe("toSearchQuery", () => {
    it("keeps content words and ORs them so a sentence still matches", () => {
        expect(toSearchQuery("What is the role of mitochondria in ATP synthesis?")).toBe("role or mitochondria or atp or synthesis");
    });

    it("never lets the question add search operators", () => {
        expect(toSearchQuery('enzymes OR -"kinetics" and not catalysis')).toBe("enzymes or kinetics or catalysis");
        expect(toSearchQuery("what is it?")).toBeUndefined();
    });
});

describe("QuestionAnswerer", () => {
    it("returns the cited passages as sources", async () => {
        const result = await answerer({ answerable: true, answer: "They lower activation energy.", sourceIds: ["[S1]"] }).answer(
            "What do enzymes do?",
            [passage],
        );

        expect(result).toMatchObject({ answerable: true, answer: "They lower activation energy.", model: "test-model" });
        expect(result.sources).toEqual([{ kind: "transcript", lectureId: "7", title: "Enzymes", startSeconds: 0, endSeconds: 42 }]);
    });

    it("does not present an answer that cites nothing it was given", async () => {
        const result = await answerer({ answerable: true, answer: "Probably ATP.", sourceIds: ["S9"] }).answer("What is made?", [passage]);

        expect(result).toMatchObject({ answerable: false, answer: NO_EVIDENCE_ANSWER, sources: [] });
    });
});

describe("QuestionService", () => {
    it("answers without calling the model when nothing relevant is indexed", async () => {
        const search = vi.fn(async (): Promise<ContentPassage[]> => []);
        const answer = vi.fn();
        const service = new QuestionService({ search }, { answer });

        const result = await service.ask({ courseId: "1", question: "What is photosynthesis?" });

        expect(result).toEqual({ answerable: false, answer: NO_EVIDENCE_ANSWER, sources: [] });
        expect(search).toHaveBeenCalledWith({ courseId: "1", text: "photosynthesis", limit: 8 });
        expect(answer).not.toHaveBeenCalled();
    });

    it("retrieves within the lecture and passes the passages to the answerer", async () => {
        const search = vi.fn(async (): Promise<ContentPassage[]> => [passage]);
        const answer = vi.fn<QuestionAnswerer["answer"]>(async () => ({ answerable: true, answer: "ok", sources: [] }));
        const service = new QuestionService({ search }, { answer });

        await service.ask({ courseId: "1", lectureId: "7", question: "What do enzymes lower?" });

        expect(search).toHaveBeenCalledWith({ courseId: "1", text: "enzymes or lower", lectureId: "7", limit: 8 });
        expect(answer).toHaveBeenCalledWith("What do enzymes lower?", [passage], {});
    });

    it("rejects an empty question", async () => {
        const service = new QuestionService({ search: vi.fn() }, { answer: vi.fn() });

        await expect(service.ask({ courseId: "1", question: "   " })).rejects.toBeInstanceOf(QaError);
    });
});
