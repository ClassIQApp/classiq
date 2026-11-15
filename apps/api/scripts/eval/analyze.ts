import {
    formatProportion,
    groupBy,
    isFullyValid,
    parseCorrectness,
    parseYes,
    proportion,
    type ScoredAnswer,
    type ScoredQuestion,
} from "../../src/core/evaluation/analysis.ts";
import { parseCsvRecords } from "../../src/core/evaluation/csv.ts";
import { markdownTable } from "../../src/core/evaluation/table.ts";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

interface Result {
    key: string;
    task: "qa" | "quiz";
    condition: string;
    latencyMs?: number;
    costUsd?: number;
    context?: { characters: number };
    error?: string;
}

const CONDITIONS = ["A", "B", "C"];
const CATEGORIES = ["lecture", "document", "unanswerable"];

const { values } = parseArgs({ options: { results: { type: "string" } } });

if (!values.results) {
    throw new Error("Usage: eval:analyze --results <directory>");
}

const directory = path.resolve(values.results);
const read = (name: string) => readFileSync(path.resolve(directory, name), "utf8");

const keys = new Map(parseCsvRecords(read("key.csv")).map((record) => [record.id!, record]));
const results = new Map(
    read("results.jsonl")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Result)
        .map((row): [string, Result] => [row.key, row]),
);
const scoring = parseCsvRecords(read("scoring.csv"));

const conditionOf = (id: string) => keys.get(id)?.condition ?? "?";

const answers: ScoredAnswer[] = scoring
    .filter((record) => record.task === "qa")
    .map((record) => {
        const result = results.get(keys.get(record.id!)?.key ?? "");

        return {
            condition: conditionOf(record.id!),
            lecture: record.lecture!,
            category: record.category!,
            correctness: parseCorrectness(record.correctness!),
            unsupportedClaim: parseYes(record.unsupported_claim!),
            correctDecline: parseYes(record.correct_decline!),
            sourceSupport: parseYes(record.source_support!),
            latencyMs: result?.latencyMs,
            costUsd: result?.costUsd,
            contextCharacters: result?.context?.characters,
        };
    });

const questions: ScoredQuestion[] = scoring
    .filter((record) => record.task === "quiz")
    .map((record) => ({
        condition: conditionOf(record.id!),
        lecture: record.lecture!,
        singleCorrect: parseYes(record.single_correct!),
        keyOk: parseYes(record.key_ok!),
        explanationOk: parseYes(record.explanation_ok!),
        duplicate: parseYes(record.duplicate!),
        supported: parseYes(record.supported!),
    }));

const unscored =
    answers.filter((answer) => answer.correctness === undefined).length +
    questions.filter((question) => isFullyValid(question) === undefined).length;

const select = <T extends { condition: string }>(rows: readonly T[], condition: string) =>
    rows.filter((row) => row.condition === condition);
const correct = (answer: ScoredAnswer) => (answer.correctness === undefined ? undefined : answer.correctness === "correct");
const yes = (value: "yes" | "no" | undefined) => (value === undefined ? undefined : value === "yes");

const answerRows = CONDITIONS.flatMap((condition) =>
    CATEGORIES.map((category) => {
        const rows = select(answers, condition).filter((answer) => answer.category === category);
        const share = (matches: ScoredAnswer["correctness"]) =>
            proportion(rows, (answer) => (answer.correctness === undefined ? undefined : answer.correctness === matches));

        return [
            condition,
            category,
            rows.length,
            formatProportion(proportion(rows, correct), true),
            formatProportion(share("partial")),
            formatProportion(share("incorrect")),
            formatProportion(proportion(rows, (answer) => yes(answer.unsupportedClaim))),
            category === "unanswerable" ? formatProportion(proportion(rows, (answer) => yes(answer.correctDecline))) : "n/a",
            formatProportion(proportion(rows, (answer) => yes(answer.sourceSupport))),
        ];
    }),
);

const pivot = <T extends { condition: string; lecture: string }>(rows: readonly T[], metric: (row: T) => boolean | undefined) =>
    [...groupBy(rows, (row) => row.lecture).entries()]
        .toSorted(([first], [second]) => first.localeCompare(second))
        .map(([lecture, lectureRows]) => [
            lecture,
            ...CONDITIONS.map((condition) => formatProportion(proportion(select(lectureRows, condition), metric))),
        ]);

const quizRows = CONDITIONS.map((condition) => {
    const rows = select(questions, condition);

    return [
        condition,
        rows.length,
        formatProportion(proportion(rows, (question) => yes(question.singleCorrect))),
        formatProportion(proportion(rows, (question) => yes(question.keyOk))),
        formatProportion(proportion(rows, (question) => yes(question.explanationOk))),
        formatProportion(proportion(rows, (question) => yes(question.duplicate))),
        formatProportion(proportion(rows, (question) => yes(question.supported))),
        formatProportion(proportion(rows, isFullyValid), true),
    ];
});

const calls = (task: Result["task"], condition: string) =>
    [...results.values()].filter((row) => row.task === task && row.condition === condition && !row.error);
const total = (numbers: readonly (number | undefined)[]) => numbers.reduce<number>((sum, value) => sum + (value ?? 0), 0);
const median = (numbers: readonly (number | undefined)[]) => {
    const sorted = numbers.filter((value): value is number => value !== undefined).toSorted((first, second) => first - second);

    return sorted.length === 0 ? "n/a" : sorted[Math.floor(sorted.length / 2)]!;
};
const perUnit = (cost: number, units: number) => (units === 0 ? "n/a" : (cost / units).toFixed(5));

const tradeoffRows = CONDITIONS.flatMap((condition) => {
    const answerCalls = calls("qa", condition);
    const quizCalls = calls("quiz", condition);
    const correctAnswers = select(answers, condition).filter((answer) => answer.correctness === "correct").length;
    const validQuestions = select(questions, condition).filter((question) => isFullyValid(question) === true).length;
    const meanContext = (rows: readonly Result[]) =>
        rows.length === 0 ? "n/a" : (total(rows.map((row) => row.context?.characters)) / rows.length).toFixed(0);

    return [
        [
            "qa",
            condition,
            answerCalls.length,
            median(answerCalls.map((row) => row.latencyMs)),
            meanContext(answerCalls),
            perUnit(total(answerCalls.map((row) => row.costUsd)), answerCalls.length),
            perUnit(total(answerCalls.map((row) => row.costUsd)), correctAnswers),
        ],
        [
            "quiz",
            condition,
            quizCalls.length,
            median(quizCalls.map((row) => row.latencyMs)),
            meanContext(quizCalls),
            perUnit(total(quizCalls.map((row) => row.costUsd)), quizCalls.length),
            perUnit(total(quizCalls.map((row) => row.costUsd)), validQuestions),
        ],
    ];
});

const report = [
    "# Evaluation analysis",
    "",
    unscored === 0 ? "Every row is scored." : `${unscored} rows are not scored yet and are left out of the rates below.`,
    "",
    "## Question answering by condition and category",
    "",
    markdownTable(
        ["condition", "category", "answers", "correct", "partial", "incorrect", "unsupported claim", "correct decline", "source support"],
        answerRows,
    ),
    "",
    "## Question answering correct rate by lecture",
    "",
    markdownTable(["lecture", ...CONDITIONS], pivot(answers, correct)),
    "",
    "## Quiz questions by condition",
    "",
    markdownTable(
        ["condition", "questions", "single correct", "key correct", "explanation correct", "duplicate", "supported", "fully valid"],
        quizRows,
    ),
    "",
    "## Quiz questions fully valid by lecture",
    "",
    markdownTable(["lecture", ...CONDITIONS], pivot(questions, isFullyValid)),
    "",
    "## Quality against latency and cost",
    "",
    markdownTable(
        [
            "task",
            "condition",
            "calls",
            "median latency ms",
            "mean context chars",
            "cost per call USD",
            "cost per correct answer or valid question USD",
        ],
        tradeoffRows,
    ),
    "",
].join("\n");

writeFileSync(path.resolve(directory, "analysis.md"), report);
console.log(report);
