import { RetryableStageError } from "./pipeline.ts";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export type ProcessingSubject =
    | { readonly kind: "resource"; readonly courseId: string; readonly resourceId: string }
    | { readonly kind: "lecture"; readonly courseId: string; readonly lectureId: string };

export class SupersededRunError extends Error {
    constructor() {
        super("This processing run is no longer active.");
        this.name = "SupersededRunError";
    }
}

interface RunRow {
    id: string;
    number: number;
    status: "running" | "succeeded" | "failed";
    deadline: Date;
    error_code: string | null;
    status_message: string;
}
export interface ProcessingStage {
    stage: string;
    status: "pending" | "running" | "succeeded" | "failed";
    attempts: number;
    status_message: string;
    error_code: string | null;
    updated_at: Date;
}

function subjectKey(subject: ProcessingSubject) {
    return subject.kind === "resource"
        ? { table: "course_resources", column: "resource_id", id: subject.resourceId }
        : { table: "lectures", column: "lecture_id", id: subject.lectureId };
}

export class PostgresProcessingRepository {
    private readonly db: Pool;

    constructor(db: Pool) {
        this.db = db;
    }

    private async lock(client: PoolClient, subject: ProcessingSubject) {
        const key = subjectKey(subject);
        const result = await client.query(`SELECT id FROM ${key.table} WHERE fk_course_id = $1 AND id = $2 FOR UPDATE`, [
            subject.courseId,
            key.id,
        ]);
        if (!result.rowCount) throw new SupersededRunError();
    }

    private async latest(client: PoolClient, subject: ProcessingSubject) {
        const key = subjectKey(subject);
        const result = await client.query<RunRow>(
            `SELECT * FROM processing_runs WHERE course_id = $1 AND ${key.column} = $2 ORDER BY number DESC LIMIT 1`,
            [subject.courseId, key.id],
        );

        return result.rows[0];
    }

    private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
        const client = await this.db.connect();
        try {
            await client.query("BEGIN");
            const result = await operation(client);
            await client.query("COMMIT");

            return result;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    private async expire(client: PoolClient, subject: ProcessingSubject, run: RunRow | undefined) {
        if (run?.status === "running" && run.deadline.getTime() <= Date.now()) {
            await this.finishFailure(client, subject, run.id, "PROCESSING_TIMEOUT", "Processing timed out. Try again.");
            run.status = "failed";
        }
    }

    async current(subject: ProcessingSubject) {
        return this.transaction(async (client) => {
            await this.lock(client, subject);
            const run = await this.latest(client, subject);
            await this.expire(client, subject, run);

            return run ? await this.latest(client, subject) : undefined;
        });
    }

    async begin(subject: ProcessingSubject, stages: readonly string[], timeoutSeconds: number) {
        if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || stages.length === 0 || new Set(stages).size !== stages.length) {
            throw new Error("Processing needs unique stages and a positive timeout.");
        }

        return this.transaction(async (client) => {
            await this.lock(client, subject);
            const previous = await this.latest(client, subject);
            await this.expire(client, subject, previous);
            if (previous?.status === "running") return { run: previous, created: false };
            if (previous?.status === "succeeded") {
                const covered = await client.query<{ count: number }>(
                    "SELECT count(*)::int AS count FROM processing_stages WHERE run_id=$1 AND stage=ANY($2::text[])",
                    [previous.id, stages],
                );
                if (covered.rows[0]!.count === stages.length) return { run: previous, created: false };
                // A newly implemented stage needs a new run, while reusing earlier output checkpoints.
            }
            const key = subjectKey(subject);
            const number = (previous?.number ?? 0) + 1;
            const id = `${subject.kind}-${key.id}-run-${number}`;
            const result = await client.query<RunRow>(
                `INSERT INTO processing_runs (id, course_id, ${key.column}, number, status, deadline)
                 VALUES ($1, $2, $3, $4, 'running', now() + $5 * interval '1 second') RETURNING *`,
                [id, subject.courseId, key.id, number, timeoutSeconds],
            );
            await client.query(`INSERT INTO processing_stages(run_id, stage) SELECT $1, unnest($2::text[])`, [id, stages]);
            if (subject.kind === "lecture") {
                await client.query("UPDATE lectures SET status = 'processing', status_message = '' WHERE id = $1", [key.id]);
            }

            return { run: result.rows[0]!, created: true };
        });
    }

    async dispatched(runId: string) {
        await this.db.query("UPDATE processing_runs SET dispatched_at=COALESCE(dispatched_at,now()) WHERE id=$1", [runId]);
    }
    async pendingStarts() {
        const result = await this.db.query<{
            id: string;
            course_id: number;
            lecture_id: number | null;
            resource_id: number | null;
            deadline: Date;
        }>(
            "SELECT id,course_id,lecture_id,resource_id,deadline FROM processing_runs WHERE status='running' AND dispatched_at IS NULL AND started_at<now()-interval '5 seconds' AND deadline>now() ORDER BY started_at LIMIT 100",
        );

        return result.rows.map((run) => ({
            runId: run.id,
            deadline: run.deadline,
            input:
                run.lecture_id === null
                    ? { kind: "resource" as const, courseId: String(run.course_id), resourceId: String(run.resource_id) }
                    : { kind: "lecture" as const, courseId: String(run.course_id), lectureId: String(run.lecture_id) },
        }));
    }

    async guard(client: PoolClient, subject: ProcessingSubject, runId: string) {
        await this.lock(client, subject);
        const run = await this.latest(client, subject);
        if (run?.id !== runId || run.status !== "running" || run.deadline.getTime() <= Date.now()) throw new SupersededRunError();
    }

    async invoke<T>(subject: ProcessingSubject, runId: string, operation: string, deadline: Date, work: () => Promise<T>): Promise<T> {
        if (subject.kind !== "lecture") throw new Error("Provider invocations require a lecture.");
        const owner = randomUUID();
        const acquired = await this.transaction(async (client) => {
            await this.guard(client, subject, runId);
            const result = await client.query(
                `INSERT INTO processing_invocations(course_id,lecture_id,operation,owner,run_id,lease_until)
                 VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (lecture_id,operation) DO UPDATE
                 SET owner=EXCLUDED.owner,run_id=EXCLUDED.run_id,lease_until=EXCLUDED.lease_until
                 WHERE processing_invocations.lease_until <= now() RETURNING owner`,
                [subject.courseId, subject.lectureId, operation, owner, runId, new Date(deadline.getTime() + 30_000)],
            );

            return !!result.rowCount;
        });
        if (!acquired) throw new RetryableStageError("INVOCATION_BUSY", "This work is already running. Try again shortly.");
        try {
            return await work();
        } finally {
            await this.db.query("DELETE FROM processing_invocations WHERE lecture_id=$1 AND operation=$2 AND owner=$3", [
                subject.lectureId,
                operation,
                owner,
            ]);
        }
    }

    async stage(subject: ProcessingSubject, runId: string, stage: string, status: "running" | "succeeded", attempt: number) {
        return this.transaction(async (client) => {
            await this.guard(client, subject, runId);
            const result = await client.query(
                `UPDATE processing_stages SET status = $3, attempts = GREATEST(attempts, $4),
                 started_at = COALESCE(started_at, now()), finished_at = CASE WHEN $3 = 'succeeded' THEN now() END,
                 error_code = NULL, status_message = '', updated_at = now() WHERE run_id = $1 AND stage = $2 AND status NOT IN ('succeeded', 'failed') RETURNING stage`,
                [runId, stage, status, attempt],
            );

            return Boolean(result.rowCount);
        });
    }

    async stageFailed(subject: ProcessingSubject, runId: string, stage: string, code: string, message: string) {
        return this.transaction(async (client) => {
            await this.guard(client, subject, runId);
            await client.query(
                `UPDATE processing_stages SET status='failed', error_code=$3, status_message=$4,
                 finished_at=now(), updated_at=now() WHERE run_id=$1 AND stage=$2 AND status <> 'succeeded'`,
                [runId, stage, code, message],
            );
        });
    }

    async succeed(subject: ProcessingSubject, runId: string) {
        if (subject.kind === "lecture") throw new Error("Lecture publication requires verified content.");

        return this.transaction(async (client) => {
            await this.guard(client, subject, runId);
            await client.query(
                `UPDATE processing_runs SET status = 'succeeded', finished_at = now()
                WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM processing_stages WHERE run_id = $1 AND status <> 'succeeded')`,
                [runId],
            );
        });
    }

    private async finishFailure(client: PoolClient, subject: ProcessingSubject, runId: string, code: string, message: string) {
        await client.query(
            `UPDATE processing_runs SET status = 'failed', error_code = $2, status_message = $3, finished_at = now() WHERE id = $1`,
            [runId, code, message],
        );
        await client.query(
            `UPDATE processing_stages SET status = 'failed', error_code = $2, status_message = $3,
            finished_at = now(), updated_at = now() WHERE run_id = $1 AND status IN ('pending','running')`,
            [runId, code, message],
        );
        if (subject.kind === "lecture") {
            await client.query(
                `UPDATE lectures SET status = CASE WHEN $2 = 'START_FAILED' THEN 'uploaded' ELSE 'failed' END,
                status_message = $3 WHERE id = $1`,
                [subject.lectureId, code, message],
            );
        }
    }

    async fail(subject: ProcessingSubject, runId: string, code: string, message: string) {
        return this.transaction(async (client) => {
            await this.lock(client, subject);
            const run = await this.latest(client, subject);
            if (run?.id !== runId || run.status !== "running") return;
            const unfinished = await client.query("SELECT 1 FROM processing_stages WHERE run_id = $1 AND status <> 'succeeded' LIMIT 1", [
                runId,
            ]);
            if (!unfinished.rowCount && subject.kind === "resource") return;
            await this.finishFailure(client, subject, runId, code, message.slice(0, 500));
        });
    }

    async stages(subject: ProcessingSubject) {
        const run = await this.current(subject);
        if (!run) return [];
        const result = await this.db.query<ProcessingStage>("SELECT * FROM processing_stages WHERE run_id = $1 ORDER BY stage", [run.id]);

        return result.rows;
    }

    async expireRuns() {
        const result = await this.db.query<{ course_id: number; lecture_id: number | null; resource_id: number | null }>(
            "SELECT course_id, lecture_id, resource_id FROM processing_runs WHERE status = 'running' AND deadline <= now() LIMIT 100",
        );
        for (const row of result.rows) {
            await this.current(
                row.resource_id === null
                    ? { kind: "lecture", courseId: String(row.course_id), lectureId: String(row.lecture_id) }
                    : { kind: "resource", courseId: String(row.course_id), resourceId: String(row.resource_id) },
            );
        }
    }
}
