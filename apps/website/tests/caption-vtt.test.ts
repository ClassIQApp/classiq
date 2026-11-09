import type { TranscriptSegment } from "../src/api/lectures/content.ts";
import { captionVtt } from "../src/components/lectures/caption-vtt.ts";
import assert from "node:assert/strict";
import test from "node:test";

function segment(text: string, startSeconds: number, endSeconds: number): TranscriptSegment {
    return { text, startSeconds, endSeconds, language: "en" };
}

test("captions retain transcript timing, gaps, and timestamps beyond an hour", () => {
    const segments = [segment("First phrase", 0, 1.234), segment("Later phrase", 3661.005, 3662.9996)];

    assert.equal(
        captionVtt(segments),
        "WEBVTT\n\n00:00:00.000 --> 00:00:01.234\nFirst phrase\n\n01:01:01.005 --> 01:01:03.000\nLater phrase\n",
    );
    assert.equal(segments[1]?.endSeconds, 3662.9996);
});

test("transcript markup is displayed literally and blank lines cannot split a cue", () => {
    assert.equal(
        captionVtt([segment("  x < y & z > 0\n\n<b>literal</b> --> next  ", 0, 2)]),
        "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nx &lt; y &amp; z &gt; 0 &lt;b&gt;literal&lt;/b&gt; --&gt; next\n",
    );
});

test("empty or invalid cues are skipped without breaking usable captions", () => {
    assert.equal(
        captionVtt([
            segment("", 0, 1),
            segment("   ", 0, 1),
            segment("No duration", 1, 1),
            segment("Too short", 1, 1.0001),
            segment("Backwards", 3, 2),
            segment("Negative", -1, 1),
            segment("Not finite", 0, Infinity),
            segment("Valid", 2, 3),
        ]),
        "WEBVTT\n\n00:00:02.000 --> 00:00:03.000\nValid\n",
    );
    assert.equal(captionVtt([]), "WEBVTT\n\n\n");
});

test("caption text supports translated characters", () => {
    assert.match(captionVtt([{ ...segment("¿Cómo estás?", 0, 2), language: "es" }]), /¿Cómo estás\?/);
});
