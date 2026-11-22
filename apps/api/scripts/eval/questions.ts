import { categorySchema, benchmarkSchema } from "../../src/core/evaluation/benchmark.ts";
import { parseCsvRecords, stringifyCsv } from "../../src/core/evaluation/csv.ts";
import { loadBenchmark } from "./benchmark-files.ts";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const PER_LECTURE = { lecture: 4, document: 4, unanswerable: 2 } as const;
const COLUMNS = ["id", "lecture", "lecture_title", "category", "question", "reference_answer", "where_the_answer_is"];

const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { benchmark: { type: "string" }, csv: { type: "string" } },
});
const [command] = positionals;

if (!values.benchmark || !values.csv || (command !== "template" && command !== "import")) {
    throw new Error("Usage: eval:questions template|import --benchmark <benchmark.json> --csv <questions.csv>");
}

const { benchmark } = loadBenchmark(values.benchmark);
const csvPath = path.resolve(values.csv);

if (command === "template") {
    const rows = benchmark.lectures.flatMap((lecture) =>
        categorySchema.options.flatMap((category) =>
            Array.from({ length: PER_LECTURE[category] }, (_, index) => [
                `${lecture.id}-${category.slice(0, 1).toUpperCase()}${index + 1}`,
                lecture.id,
                lecture.title,
                category,
                "",
                "",
                "",
            ]),
        ),
    );

    writeFileSync(csvPath, stringifyCsv([COLUMNS, ...rows]));
    console.log(`${rows.length} blank rows written to ${csvPath}`);
} else {
    const records = parseCsvRecords(readFileSync(csvPath, "utf8"));
    const filled = records.filter((record) => record.question!.trim() !== "" || record.reference_answer!.trim() !== "");
    const incomplete = filled.filter((record) => record.question!.trim() === "" || record.reference_answer!.trim() === "");

    if (incomplete.length > 0) {
        throw new Error(`Rows with a question or reference answer missing: ${incomplete.map((record) => record.id).join(", ")}`);
    }

    const questions = filled.map((record) => ({
        id: record.id!.trim(),
        lectureId: record.lecture!.trim(),
        category: record.category!.trim(),
        question: record.question!.trim(),
        reference: record.reference_answer!.trim(),
    }));
    const ids = questions.map((question) => question.id);

    if (new Set(ids).size !== ids.length) {
        throw new Error("Question ids must be unique");
    }

    const counts = benchmark.lectures.flatMap((lecture) =>
        categorySchema.options.map((category) => ({
            lecture: lecture.id,
            category,
            have: questions.filter((question) => question.lectureId === lecture.id && question.category === category).length,
            want: PER_LECTURE[category],
        })),
    );
    const off = counts.filter((count) => count.have !== count.want);

    writeFileSync(
        path.resolve(path.dirname(path.resolve(values.benchmark)), "benchmark.json"),
        `${JSON.stringify(benchmarkSchema.parse({ ...benchmark, questions }), null, 2)}\n`,
    );

    const lock = {
        importedAt: new Date().toISOString(),
        questions: questions.length,
        questionsSha256: createHash("sha256").update(JSON.stringify(questions)).digest("hex"),
    };

    writeFileSync(path.resolve(path.dirname(path.resolve(values.benchmark)), "questions.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
    console.log(`${questions.length} questions imported (${lock.questionsSha256.slice(0, 12)}), recorded in questions.lock.json`);
    console.log(
        off.length === 0
            ? "Every lecture has 4 lecture, 4 document and 2 unanswerable questions."
            : `Not the planned 4/4/2: ${off.map((count) => `${count.lecture} ${count.category} ${count.have}/${count.want}`).join(", ")}`,
    );
}
