import { readLlmConfig } from "../../src/core/ai/config.ts";
import { createLlmService } from "../../src/core/ai/create-llm-service.ts";
import type { LlmCallOptions, LlmRequest, LlmResponse, LlmUsage } from "../../src/core/ai/model.ts";
import { ContentIndexService } from "../../src/core/content-index/content-index-service.ts";
import type { IndexedPassage } from "../../src/core/content-index/model.ts";
import { PostgresContentIndexRepository } from "../../src/core/content-index/postgres-content-index-repository.ts";
import { estimateCost } from "../../src/core/evaluation/cost.ts";
import { buildJobs, createRandom, type Condition, type Job, type Task } from "../../src/core/evaluation/jobs.ts";
import { QuestionAnswerer, takeWithinBudget } from "../../src/core/qa/question-answerer.ts";
import { toSearchQuery } from "../../src/core/qa/search-query.ts";
import { QuizGenerator, selectPassages } from "../../src/core/quiz/quiz-generator.ts";
import { createDatabase } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import { loadBenchmark, readJson } from "./benchmark-files.ts";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { Pool } from "pg";

interface Ingested {
    courseId: string;
}

interface Call {
    latencyMs: number;
    usage?: LlmUsage;
    model?: string;
}

const { values } = parseArgs({
    options: {
        benchmark: { type: "string" },
        out: { type: "string" },
        lecture: { type: "string", multiple: true },
        tasks: { type: "string" },
        conditions: { type: "string" },
        "dry-run": { type: "boolean" },
    },
});

if (!values.benchmark || !values.out) {
    throw new Error(
        "Usage: eval:run --benchmark <benchmark.json> --out <directory> [--lecture <id>] [--tasks qa,quiz] [--conditions A,B,C] [--dry-run]",
    );
}

const { benchmark, directory } = loadBenchmark(values.benchmark);
const { config } = benchmark;
const tasks = (values.tasks?.split(",") ?? ["qa", "quiz"]) as Task[];
const conditions = (values.conditions?.split(",") ?? ["A", "B", "C"]) as Condition[];
const lectureIds = values.lecture ?? benchmark.lectures.map((lecture) => lecture.id);

const jobs = buildJobs({
    questions: benchmark.questions,
    lectureIds,
    conditions,
    tasks,
    runs: config.runs,
    quizRuns: config.quizRuns,
    seed: config.seed,
});

console.log(`${jobs.length} jobs: ${tasks.map((task) => `${task} ${jobs.filter((job) => job.task === task).length}`).join(", ")}`);

class RecordingLlm {
    last: Call | undefined;
    private readonly llm = createLlmService();

    async generateStructured<T>(
        request: LlmRequest,
        schema: Parameters<typeof this.llm.generateStructured<T>>[1],
        options?: LlmCallOptions,
    ): Promise<LlmResponse<T>> {
        const startedAt = performance.now();

        try {
            const response = await this.llm.generateStructured(request, schema, options);

            this.last = { latencyMs: Math.round(performance.now() - startedAt), usage: response.usage, model: response.model };

            return response;
        } catch (error) {
            this.last = { latencyMs: Math.round(performance.now() - startedAt) };

            throw error;
        }
    }
}

function slug(value: string) {
    return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
}

async function firstId(db: Pool, sql: string, parameters: unknown[]): Promise<number | undefined> {
    const result = await db.query<{ id: number }>(sql, parameters);

    return result.rows[0]?.id;
}

async function ingest(db: Pool, content: ContentIndexService): Promise<Map<string, Ingested>> {
    const ingested = new Map<string, Ingested>();

    for (const lecture of benchmark.lectures) {
        const courseId = (await firstId(
            db,
            `INSERT INTO courses (name, slug, code) VALUES ($1, $2, $3)
             ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [lecture.title, `eval-${slug(lecture.id)}`, lecture.id],
        ))!;
        const lectureId =
            (await firstId(db, "SELECT id FROM lectures WHERE fk_course_id = $1 ORDER BY id LIMIT 1", [courseId])) ??
            (await firstId(db, "INSERT INTO lectures (fk_course_id, title) VALUES ($1, $2) RETURNING id", [courseId, lecture.title]))!;

        await content.indexSource(
            { kind: "transcript", courseId: String(courseId), lectureId: String(lectureId) },
            readJson(path.resolve(directory, lecture.transcript)) as never,
        );

        for (const document of lecture.documents) {
            const resourceId =
                (await firstId(db, "SELECT id FROM course_resources WHERE fk_course_id = $1 AND name = $2", [courseId, document.title])) ??
                (await firstId(
                    db,
                    `INSERT INTO course_resources (fk_course_id, fk_lecture_id, name, content_type, content_length, upload_status)
                     VALUES ($1, $2, $3, 'application/pdf', 1, 'uploaded') RETURNING id`,
                    [courseId, lectureId, document.title],
                ))!;

            await content.indexSource(
                { kind: "resource", courseId: String(courseId), resourceId: String(resourceId) },
                readJson(path.resolve(directory, document.pages)) as never,
            );
        }

        ingested.set(lecture.id, { courseId: String(courseId) });
    }

    return ingested;
}

const describePassage = (passage: IndexedPassage) => ({
    kind: passage.kind,
    title: passage.title,
    pageNumber: passage.pageNumber,
    startSeconds: passage.startSeconds,
    endSeconds: passage.endSeconds,
    characters: passage.content.length,
});

async function main(outDirectory: string) {
    const out = outDirectory;
    const resultsPath = path.resolve(out, "results.jsonl");

    mkdirSync(out, { recursive: true });

    const db = createDatabase(process.env.DATABASE_URL ?? "");
    await runMigrations(db);

    const content = new ContentIndexService(new PostgresContentIndexRepository(db));
    const ingested = await ingest(db, content);
    const llmConfig = readLlmConfig(process.env);
    const llm = new RecordingLlm();
    const answerer = new QuestionAnswerer(llm, { maxContextChars: config.contextChars });
    const generator = new QuizGenerator(llm, { maxContextChars: config.contextChars, random: createRandom(config.seed) });
    const questions = new Map(benchmark.questions.map((question) => [question.id, question]));
    const lectures = new Map(benchmark.lectures.map((lecture) => [lecture.id, lecture]));

    const sourceHash = (file: string) =>
        createHash("sha256")
            .update(readFileSync(path.resolve(import.meta.dirname, "../../src/core", file)))
            .digest("hex")
            .slice(0, 12);

    writeFileSync(
        path.resolve(out, "run-config.json"),
        JSON.stringify(
            {
                startedAt: new Date().toISOString(),
                commit: execFileSync("git", ["rev-parse", "HEAD"]).toString().trim(),
                uncommittedSourceChanges: execFileSync("git", ["status", "--porcelain", "--", "src"]).toString().trim() !== "",
                benchmarkSha256: createHash("sha256")
                    .update(readFileSync(path.resolve(values.benchmark!)))
                    .digest("hex"),
                questionsSha256: createHash("sha256").update(JSON.stringify(benchmark.questions)).digest("hex"),
                provider: llmConfig.provider,
                model: llmConfig.model,
                promptVersions: { qa: sourceHash("qa/question-answerer.ts"), quiz: sourceHash("quiz/quiz-generator.ts") },
                tasks,
                conditions,
                lectures: lectureIds,
                ...config,
            },
            undefined,
            2,
        ),
    );

    const finished = new Set(
        existsSync(resultsPath)
            ? readFileSync(resultsPath, "utf8")
                  .split("\n")
                  .filter(Boolean)
                  .map((line) => JSON.parse(line) as { key: string; error?: string })
                  .filter((row) => !row.error)
                  .map((row) => row.key)
            : [],
    );

    async function retrieve(job: Job, text: string, courseId: string): Promise<IndexedPassage[]> {
        if (job.condition === "A") {
            return [];
        }

        const query = toSearchQuery(text);

        if (!query) {
            return [];
        }

        const search = (kind: "transcript" | "resource") =>
            content.search({ courseId, text: query, kinds: [kind], limit: config.passageLimit });
        const transcriptPassages = await search("transcript");
        const transcript = takeWithinBudget(transcriptPassages, job.condition === "B" ? config.contextChars : config.contextChars / 2);

        if (job.condition === "B") {
            return transcript;
        }

        const documentPassages = await search("resource");

        return [...transcript, ...takeWithinBudget(documentPassages, config.contextChars / 2)];
    }

    async function quizPassages(job: Job, courseId: string): Promise<IndexedPassage[]> {
        if (job.condition === "A") {
            return [];
        }

        const all = await content.listPassages({ courseId });
        const transcript = selectPassages(
            all.filter((passage) => passage.kind === "transcript"),
            job.condition === "B" ? config.contextChars : config.contextChars / 2,
        );

        return job.condition === "B"
            ? transcript
            : [
                  ...transcript,
                  ...selectPassages(
                      all.filter((passage) => passage.kind === "resource"),
                      config.contextChars / 2,
                  ),
              ];
    }

    async function execute(job: Job) {
        const lecture = lectures.get(job.lectureId)!;
        const { courseId } = ingested.get(job.lectureId)!;
        const startedAt = new Date().toISOString();
        llm.last = undefined;

        try {
            if (job.task === "qa") {
                const question = questions.get(job.questionId!)!;
                const passages = await retrieve(job, question.question, courseId);
                const answer = await answerer.answer(question.question, passages);

                return {
                    startedAt,
                    context: { ...answer.context, passages: passages.map((passage) => describePassage(passage)) },
                    output: { answer: answer.answer, answerable: answer.answerable, sources: answer.sources },
                };
            }

            const passages = await quizPassages(job, courseId);
            const quiz = await generator.generate(passages, config.quizQuestions, { topic: lecture.topic });

            return {
                startedAt,
                context: {
                    passages: passages.map((passage) => describePassage(passage)),
                    characters: passages.reduce((total, passage) => total + passage.content.length, 0),
                },
                output: { title: quiz.title, questions: quiz.questions },
            };
        } catch (error) {
            return { startedAt, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
        }
    }

    const pending = jobs.filter((job) => !finished.has(job.key));

    console.log(`${pending.length} to run, ${jobs.length - pending.length} already finished`);

    for (const [index, job] of pending.entries()) {
        const result = await execute(job);
        const usage = llm.last?.usage;

        appendFileSync(
            resultsPath,
            `${JSON.stringify({
                key: job.key,
                task: job.task,
                lectureId: job.lectureId,
                questionId: job.questionId,
                condition: job.condition,
                run: job.run,
                ...result,
                latencyMs: llm.last?.latencyMs,
                model: llm.last?.model,
                inputTokens: usage?.inputTokens,
                outputTokens: usage?.outputTokens,
                costUsd: usage ? estimateCost(usage, config.pricing) : undefined,
            })}\n`,
        );

        console.log(`[${index + 1}/${pending.length}] ${job.key}${"error" in result ? ` FAILED ${result.error}` : ""}`);
    }

    await db.end();
}

if (!values["dry-run"]) {
    await main(path.resolve(values.out));
}
