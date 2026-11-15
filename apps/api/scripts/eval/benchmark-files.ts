import { benchmarkSchema, type Benchmark } from "../../src/core/evaluation/benchmark.ts";
import { readFileSync } from "node:fs";
import path from "node:path";

export function readJson(file: string): unknown {
    return JSON.parse(readFileSync(file, "utf8"));
}

export function loadBenchmark(file: string): { benchmark: Benchmark; directory: string } {
    const parsed = benchmarkSchema.safeParse(readJson(file));

    if (!parsed.success) {
        throw new Error(`Invalid benchmark file: ${parsed.error.message}`);
    }

    const lectureIds = parsed.data.lectures.map((lecture) => lecture.id);
    const unknown = parsed.data.questions.filter((question) => !lectureIds.includes(question.lectureId));

    if (unknown.length > 0 || new Set(lectureIds).size !== lectureIds.length) {
        throw new Error("Lecture ids must be unique and every question must name an existing lecture");
    }

    return { benchmark: parsed.data, directory: path.dirname(path.resolve(file)) };
}
