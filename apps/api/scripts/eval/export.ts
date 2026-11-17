import { seededShuffle } from "../../src/core/evaluation/jobs.ts";
import { loadBenchmark } from "./benchmark-files.ts";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

interface Source {
    title: string;
    pageNumber?: number;
    startSeconds?: number;
}

interface QuizQuestion {
    prompt: string;
    choices: string[];
    correctChoice: number;
    explanation: string;
    sources: Source[];
}

interface Result {
    key: string;
    task: "qa" | "quiz";
    lectureId: string;
    questionId?: string;
    condition: string;
    run: number;
    latencyMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    context?: { characters: number };
    error?: string;
    output?: { answer?: string; answerable?: boolean; sources?: Source[]; questions?: QuizQuestion[] };
}

const { values } = parseArgs({ options: { benchmark: { type: "string" }, results: { type: "string" } } });

if (!values.benchmark || !values.results) {
    throw new Error("Usage: eval:export --benchmark <benchmark.json> --results <directory>");
}

const { benchmark } = loadBenchmark(values.benchmark);
const directory = path.resolve(values.results);
const questions = new Map(benchmark.questions.map((question) => [question.id, question]));

const latest = new Map(
    readFileSync(path.resolve(directory, "results.jsonl"), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Result)
        .map((row): [string, Result] => [row.key, row]),
);
const results = [...latest.values()];

const csv = (rows: (string | number | undefined)[][]) =>
    rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");

const describeSource = (source: Source) =>
    source.pageNumber === undefined ? `${source.title} @${source.startSeconds ?? 0}s` : `${source.title} p${source.pageNumber}`;

interface Item {
    key: string;
    condition: string;
    run: number;
    index: number;
    columns: (string | number | undefined)[];
}

const items: Item[] = results
    .filter((row) => row.output && !row.error)
    .flatMap((row): Item[] => {
        if (row.task === "qa") {
            const question = questions.get(row.questionId!)!;

            return [
                {
                    key: row.key,
                    condition: row.condition,
                    run: row.run,
                    index: 0,
                    columns: [
                        "qa",
                        row.lectureId,
                        question.category,
                        question.question,
                        question.reference,
                        row.output!.answer,
                        (row.output!.sources ?? []).map((source) => describeSource(source)).join("; "),
                        "",
                        "",
                        "",
                    ],
                },
            ];
        }

        return (row.output!.questions ?? []).map((quizQuestion, index) => ({
            key: row.key,
            condition: row.condition,
            run: row.run,
            index,
            columns: [
                "quiz",
                row.lectureId,
                "",
                quizQuestion.prompt,
                "",
                "",
                quizQuestion.sources.map((source) => describeSource(source)).join("; "),
                quizQuestion.choices.map((choice, position) => `${String.fromCodePoint(65 + position)}. ${choice}`).join(" | "),
                String.fromCodePoint(65 + quizQuestion.correctChoice),
                quizQuestion.explanation,
            ],
        }));
    });

const shuffled = seededShuffle(items, benchmark.config.seed).map((item, position) => ({
    ...item,
    id: `r${String(position + 1).padStart(4, "0")}`,
}));
const scores = [
    "correctness",
    "unsupported_claim",
    "correct_decline",
    "source_support",
    "single_correct",
    "key_ok",
    "explanation_ok",
    "duplicate",
    "supported",
    "notes",
];

writeFileSync(
    path.resolve(directory, "scoring.csv"),
    csv([
        [
            "id",
            "task",
            "lecture",
            "category",
            "question",
            "reference",
            "answer",
            "sources",
            "choices",
            "correct_choice",
            "explanation",
            ...scores,
        ],
        ...shuffled.map((item) => [item.id, ...item.columns, ...scores.map(() => "")]),
    ]),
);
writeFileSync(
    path.resolve(directory, "key.csv"),
    csv([["id", "key", "condition", "run", "item"], ...shuffled.map((item) => [item.id, item.key, item.condition, item.run, item.index])]),
);

const percentile = (sorted: number[], fraction: number) =>
    sorted.length === 0 ? "n/a" : String(sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)]);
const mean = (numbers: number[]) =>
    numbers.length === 0 ? "n/a" : (numbers.reduce((total, value) => total + value, 0) / numbers.length).toFixed(0);
const defined = (numbers: (number | undefined)[]) => numbers.filter((value): value is number => value !== undefined);

const groups = results.reduce((map, row) => {
    const name = `${row.task} ${row.condition}`;

    return map.set(name, [...(map.get(name) ?? []), row]);
}, new Map<string, Result[]>());

const summary = [
    "| task and condition | calls | failed | median ms | p95 ms | mean input tokens | mean output tokens | mean context chars | total cost USD |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...[...groups.entries()]
        .toSorted(([first], [second]) => first.localeCompare(second))
        .map(([name, rows]) => {
            const latencies = defined(rows.map((row) => row.latencyMs)).toSorted((first, second) => first - second);
            const cost = defined(rows.map((row) => row.costUsd));

            return `| ${name} | ${rows.length} | ${rows.filter((row) => row.error).length} | ${percentile(latencies, 0.5)} | ${percentile(latencies, 0.95)} | ${mean(defined(rows.map((row) => row.inputTokens)))} | ${mean(defined(rows.map((row) => row.outputTokens)))} | ${mean(defined(rows.map((row) => row.context?.characters)))} | ${cost.length === 0 ? "n/a" : cost.reduce((total, value) => total + value, 0).toFixed(4)} |`;
        }),
].join("\n");

writeFileSync(path.resolve(directory, "summary.md"), `${summary}\n`);
console.log(`${shuffled.length} items to score in scoring.csv (condition hidden; see key.csv)`);
console.log(summary);
