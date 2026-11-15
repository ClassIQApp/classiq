import { wordErrorRate } from "../../src/core/evaluation/word-error-rate.ts";
import { loadBenchmark, readJson } from "./benchmark-files.ts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

interface Segment {
    text: string;
    startSeconds: number;
    endSeconds: number;
}

const { values } = parseArgs({ options: { benchmark: { type: "string" } } });

if (!values.benchmark) {
    throw new Error("Usage: eval:wer --benchmark <benchmark.json>");
}

const { benchmark, directory } = loadBenchmark(values.benchmark);

const rows = benchmark.lectures
    .filter((lecture) => lecture.wer)
    .map((lecture) => {
        const { reference, startSeconds, endSeconds } = lecture.wer!;
        const segments = readJson(path.resolve(directory, lecture.transcript)) as Segment[];
        const hypothesis = segments
            .filter((segment) => segment.startSeconds >= startSeconds && segment.endSeconds <= endSeconds)
            .map((segment) => segment.text)
            .join(" ");
        const result = wordErrorRate(readFileSync(path.resolve(directory, reference), "utf8"), hypothesis);

        return { lecture: lecture.id, excerptSeconds: endSeconds - startSeconds, ...result };
    });

console.log("lecture,excerptSeconds,referenceWords,substitutions,deletions,insertions,wer");

for (const row of rows) {
    console.log(
        [row.lecture, row.excerptSeconds, row.referenceWords, row.substitutions, row.deletions, row.insertions, row.rate.toFixed(4)].join(
            ",",
        ),
    );
}

const words = rows.reduce((total, row) => total + row.referenceWords, 0);
const errors = rows.reduce((total, row) => total + row.substitutions + row.deletions + row.insertions, 0);

console.log(
    `overall,${rows.reduce((total, row) => total + row.excerptSeconds, 0)},${words},,,,${words === 0 ? "n/a" : (errors / words).toFixed(4)}`,
);
