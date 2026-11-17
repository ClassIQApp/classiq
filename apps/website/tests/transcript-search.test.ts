import { findMatches, findRanges, splitByRanges, wrapIndex } from "../src/components/lectures/transcript-search.ts";
import type { SearchableParagraph } from "../src/components/lectures/transcript-search.ts";
import assert from "node:assert/strict";
import test from "node:test";

test("matching ignores case and diacritics but reports offsets in the original text", () => {
    const text = "La Energía de activación, ENERGIA libre";

    assert.deepEqual(
        findRanges(text, "energia").map((range) => text.slice(range.start, range.end)),
        ["Energía", "ENERGIA"],
    );
    assert.deepEqual(findRanges(text, "  "), []);
    assert.deepEqual(findRanges("price (USD) $5.00", "(usd)").length, 1);
});

test("matches are numbered across paragraphs and follow the visible language mode", () => {
    const paragraphs: SearchableParagraph[] = [
        { key: "a", phrases: [{ index: 0, text: "Rates of reaction", translation: "Velocidades de reacción" }] },
        { key: "b", phrases: [{ index: 1, text: "The reaction slows", translation: "La reacción se ralentiza" }] },
    ];

    assert.deepEqual(
        findMatches(paragraphs, "original", "reaction").map((match) => [match.id, match.paragraphKey, match.field]),
        [
            [0, "a", "primary"],
            [1, "b", "primary"],
        ],
    );
    assert.equal(findMatches(paragraphs, "es", "reaccion").length, 2);
    assert.equal(findMatches(paragraphs, "original", "reaccion").length, 0);
    assert.deepEqual(
        findMatches(paragraphs, "both", "reac").map((match) => match.field),
        ["primary", "translation", "primary", "translation"],
    );
});

test("splitting keeps the full text and marks only matches; navigation wraps around", () => {
    const parts = splitByRanges("one two one", [
        { id: 4, start: 0, end: 3 },
        { id: 5, start: 8, end: 11 },
    ]);

    assert.equal(parts.map((part) => part.text).join(""), "one two one");
    assert.deepEqual(
        parts.filter((part) => part.matchId !== undefined).map((part) => part.matchId),
        [4, 5],
    );
    assert.equal(wrapIndex(-1, 3), 2);
    assert.equal(wrapIndex(3, 3), 0);
    assert.equal(wrapIndex(0, 0), -1);
});
