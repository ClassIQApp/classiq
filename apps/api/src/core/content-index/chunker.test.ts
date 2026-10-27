import { chunkSections } from "./chunker.ts";
import { describe, expect, it } from "vitest";

const options = { maxChars: 60, overlapChars: 25 };

describe("chunkSections", () => {
    it("normalizes whitespace and drops empty sections", () => {
        const chunks = chunkSections(
            [
                { pageNumber: 1, text: "  Cells   divide\n\tby mitosis. " },
                { pageNumber: 2, text: " \n " },
            ],
            options,
        );

        expect(chunks).toEqual([{ position: 0, content: "Cells divide by mitosis.", pageNumber: 1 }]);
    });

    it("never spans resource pages, so each chunk keeps one exact page", () => {
        const chunks = chunkSections(
            [
                { pageNumber: 1, text: "Short first page." },
                { pageNumber: 2, text: "Short second page." },
            ],
            options,
        );

        expect(chunks.map((chunk) => [chunk.pageNumber, chunk.content])).toEqual([
            [1, "Short first page."],
            [2, "Short second page."],
        ]);
    });

    it("splits long pages at sentence boundaries with overlap and no oversize chunks", () => {
        const text = Array.from({ length: 8 }, (_, index) => `Sentence number ${index} here.`).join(" ");

        const chunks = chunkSections([{ pageNumber: 3, text }], options);

        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.every((chunk) => chunk.content.length <= options.maxChars && chunk.pageNumber === 3)).toBe(true);
        expect(chunks.map((chunk) => chunk.position)).toEqual(chunks.map((_, index) => index));
        expect(chunks[1]!.content.startsWith(chunks[0]!.content.split(". ").at(-1)!)).toBe(true);
        expect(chunks.at(-1)!.content.endsWith("Sentence number 7 here.")).toBe(true);
    });

    it("hard-splits text without sentence or word boundaries", () => {
        const chunks = chunkSections([{ pageNumber: 1, text: "x".repeat(150) }], options);

        expect(chunks.map((chunk) => chunk.content.length)).toEqual([60, 60, 30]);
    });

    it("merges transcript segments and spans their time range", () => {
        const chunks = chunkSections(
            [
                { startSeconds: 0, endSeconds: 4.5, text: "Welcome to the lecture." },
                { startSeconds: 4.5, endSeconds: 9, text: "Today is about enzymes." },
                { startSeconds: 9, endSeconds: 15, text: "Enzymes lower activation energy." },
            ],
            options,
        );

        expect(chunks).toEqual([
            { position: 0, content: "Welcome to the lecture. Today is about enzymes.", startSeconds: 0, endSeconds: 9 },
            { position: 1, content: "Today is about enzymes. Enzymes lower activation energy.", startSeconds: 4.5, endSeconds: 15 },
        ]);
    });

    it("returns no chunks for empty input", () => {
        expect(chunkSections([], options)).toEqual([]);
    });
});
