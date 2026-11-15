import { formatProportion, isFullyValid, parseCorrectness, parseYes, proportion, wilsonInterval } from "./analysis.ts";
import { parseCsvRecords } from "./csv.ts";
import { joinOverlappingChunks } from "./page-text.ts";
import { describe, expect, it } from "vitest";

describe("scoring sheet helpers", () => {
    it("reads quoted cells with commas, quotes and line breaks", () => {
        const records = parseCsvRecords('"id","answer","note"\r\n"r1","He said ""yes"", then\nleft",""\r\n"r2","plain","x"\r\n');

        expect(records).toEqual([
            { id: "r1", answer: 'He said "yes", then\nleft', note: "" },
            { id: "r2", answer: "plain", note: "x" },
        ]);
    });

    it("rebuilds page text from overlapping chunks without dropping or repeating text", () => {
        const page = "Alpha beta gamma. Delta epsilon zeta. Eta theta iota. Kappa lambda mu.";
        const first = "Alpha beta gamma. Delta epsilon zeta. Eta theta iota.";
        const second = "Eta theta iota. Kappa lambda mu.";

        expect(joinOverlappingChunks([first, second])).toBe(page);
        expect(joinOverlappingChunks([first, "Nu xi omicron."])).toBe(`${first} Nu xi omicron.`);
    });

    it("leaves unscored rows out of the rates and calls a quiz question valid only when every check is filled in", () => {
        const decided = proportion(["correct", "incorrect", undefined, "correct"], (value) =>
            value === undefined ? undefined : value === "correct",
        );

        expect(decided).toEqual({ count: 2, total: 3 });
        expect(formatProportion(decided)).toBe("67% (2/3)");
        expect(wilsonInterval({ count: 8, total: 10 })[0]).toBeCloseTo(0.49, 2);
        expect(parseYes(" Y ")).toBe("yes");
        expect(parseCorrectness("Partial")).toBe("partial");
        expect(
            isFullyValid({
                condition: "A",
                lecture: "L1",
                singleCorrect: "yes",
                keyOk: "yes",
                explanationOk: "yes",
                duplicate: "no",
                supported: "yes",
            }),
        ).toBe(true);
        expect(
            isFullyValid({
                condition: "A",
                lecture: "L1",
                singleCorrect: "yes",
                keyOk: undefined,
                explanationOk: "yes",
                duplicate: "no",
                supported: "yes",
            }),
        ).toBeUndefined();
    });
});
