import { markdownTable } from "../../src/core/evaluation/table.ts";
import { createDatabase } from "../../src/db/client.ts";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

interface Run {
    id: string;
    lecture_id: number;
    title: string;
    number: number;
    status: string;
    error_code: string | null;
    wall_seconds: number | null;
    audio_seconds: number | null;
}

interface Stage {
    run_id: string;
    stage: string;
    status: string;
    attempts: number;
    error_code: string | null;
    seconds: number | null;
}

const { values } = parseArgs({ options: { lecture: { type: "string", multiple: true }, out: { type: "string" } } });
const databaseUrl = process.env.SOURCE_DATABASE_URL;

if (!databaseUrl || !values.lecture) {
    throw new Error("Usage: SOURCE_DATABASE_URL=<url> eval:timing --lecture <lectureId> [--lecture <lectureId> ...] [--out <report.md>]");
}

const seconds = (value: number | null) => (value === null ? "n/a" : value.toFixed(1));
const db = createDatabase(databaseUrl);

async function report() {
    const lectureIds = values.lecture!.map(Number);
    const runs = await db.query<Run>(
        `SELECT r.id, r.lecture_id, l.title, r.number, r.status, r.error_code,
                EXTRACT(EPOCH FROM (r.finished_at - r.started_at))::float8 AS wall_seconds,
                (t.content->>'durationSeconds')::float8 AS audio_seconds
         FROM processing_runs r
         JOIN lectures l ON l.id = r.lecture_id
         LEFT JOIN lecture_transcripts t ON t.lecture_id = r.lecture_id
         WHERE r.lecture_id = ANY($1)
         ORDER BY r.lecture_id, r.number`,
        [lectureIds],
    );
    const stages = await db.query<Stage>(
        `SELECT run_id, stage, status, attempts, error_code,
                EXTRACT(EPOCH FROM (finished_at - started_at))::float8 AS seconds
         FROM processing_stages
         WHERE run_id = ANY($1)
         ORDER BY run_id, started_at NULLS LAST, stage`,
        [runs.rows.map((run) => run.id)],
    );
    const runLabels = new Map(runs.rows.map((run) => [run.id, `${run.lecture_id} run ${run.number}`]));

    const runTable = markdownTable(
        ["lecture", "title", "run", "status", "error", "audio min", "wall seconds", "wall seconds per audio minute"],
        runs.rows.map((run) => [
            run.lecture_id,
            run.title,
            run.number,
            run.status,
            run.error_code ?? "",
            run.audio_seconds === null ? "n/a" : (run.audio_seconds / 60).toFixed(1),
            seconds(run.wall_seconds),
            run.wall_seconds === null || !run.audio_seconds ? "n/a" : (run.wall_seconds / (run.audio_seconds / 60)).toFixed(1),
        ]),
    );
    const stageTable = markdownTable(
        ["run", "stage", "status", "attempts", "error", "seconds"],
        stages.rows.map((stage) => [
            runLabels.get(stage.run_id) ?? stage.run_id,
            stage.stage,
            stage.status,
            stage.attempts,
            stage.error_code ?? "",
            seconds(stage.seconds),
        ]),
    );

    const lecturesWithRuns = new Set(runs.rows.map((run) => run.lecture_id));
    const missing = lectureIds.filter((lectureId) => !lecturesWithRuns.has(lectureId));
    const summary = [
        `${lecturesWithRuns.size} lectures, ${runs.rows.length} runs, ${runs.rows.filter((run) => run.status !== "succeeded").length} not succeeded, ${stages.rows.filter((stage) => stage.attempts > 1).length} stages needed more than one attempt.`,
        missing.length > 0 ? `No processing runs found for lectures: ${missing.join(", ")}.` : "",
    ]
        .filter(Boolean)
        .join("\n");
    const markdown = ["# Pipeline timing", "", summary, "", "## Runs", "", runTable, "", "## Stages", "", stageTable, ""].join("\n");

    if (values.out) {
        writeFileSync(path.resolve(values.out), markdown);
    }

    console.log(markdown);
}

try {
    await report();
} finally {
    await db.end();
}
