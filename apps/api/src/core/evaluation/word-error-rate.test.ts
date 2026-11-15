import { normalizeWords, wordErrorRate } from "./word-error-rate.ts";
import { describe, expect, it } from "vitest";

describe("wordErrorRate", () => {
    it("counts substitutions, deletions and insertions against the reference", () => {
        expect(wordErrorRate("enzymes lower activation energy", "enzymes lower the activation energy now")).toEqual({
            referenceWords: 4,
            substitutions: 0,
            deletions: 0,
            insertions: 2,
            rate: 0.5,
        });
        expect(wordErrorRate("a b c d", "a d")).toMatchObject({ substitutions: 0, deletions: 2, insertions: 0, rate: 0.5 });
        expect(wordErrorRate("a b c", "a x c")).toMatchObject({ substitutions: 1, deletions: 0, insertions: 0 });
    });

    it("ignores case and punctuation and scores identical text as zero", () => {
        expect(wordErrorRate("It's ATP, right?", "its atp right").rate).toBeGreaterThan(0);
        expect(wordErrorRate("It's ATP, right?", "it's atp right").rate).toBe(0);
        expect(normalizeWords("Don't stop—GO!")).toEqual(["don't", "stop", "go"]);
    });

    it("rejects an empty reference", () => {
        expect(() => wordErrorRate("...", "anything")).toThrow(RangeError);
    });
});
