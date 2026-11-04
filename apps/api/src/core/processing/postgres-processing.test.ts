import { migrationsDirectory, runMigrations } from "../../db/migrate.ts";
import { ContentIndexService } from "../content-index/content-index-service.ts";
import { PostgresContentIndexRepository } from "../content-index/postgres-content-index-repository.ts";
import { PostgresUploadRepository } from "../uploads/postgres-upload-repository.ts";
import { PostgresContinuationInbox } from "./postgres-continuation-inbox.ts";
import { PostgresProcessingRepository } from "./postgres-processing-repository.ts";
import { ProcessingService } from "./processing-service.ts";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_UPLOAD_DATABASE_URL;

describe.skipIf(!url)("processing persistence", () => {
    const schema = `processing_${randomUUID().replaceAll("-", "")}`;
    const db = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    const repository = new PostgresProcessingRepository(db);
    const uploads = new PostgresUploadRepository(db);
    let courseId: string;
    let lectureId: string;

    beforeAll(async () => {
        await db.query(`CREATE SCHEMA ${schema}`);
        // Upgrade with real pre-existing rows, as well as fresh migrations in the other database suites.
        const directory = await mkdtemp(path.join(tmpdir(), "processing-upgrade-"));
        try {
            for (const file of await readdir(migrationsDirectory)) {
                if (file.endsWith(".sql") && file < "012") await cp(path.join(migrationsDirectory, file), path.join(directory, file));
            }
            await runMigrations(db, directory);
            const course = await db.query("INSERT INTO courses(name, slug) VALUES ('Existing course', 'existing') RETURNING id");
            courseId = String(course.rows[0].id);
            const lecture = await db.query("INSERT INTO lectures(fk_course_id, title) VALUES ($1, 'Existing lecture') RETURNING id", [
                courseId,
            ]);
            lectureId = String(lecture.rows[0].id);
            const asset = await uploads.initiate("recording", courseId, {
                lectureId,
                name: "existing.wav",
                contentType: "audio/wav",
                contentLength: 10,
            });
            await uploads.complete(asset);
            const engineMigrations = [
                "012_processing_runs.sql",
                "016_processing_invocations.sql",
                "017_processing_deliveries.sql",
                "018_processing_dispatch.sql",
            ];
            for (const file of engineMigrations) {
                await cp(path.join(migrationsDirectory, file), path.join(directory, file));
            }
            expect(await runMigrations(db, directory)).toEqual(engineMigrations);
            expect(await runMigrations(db)).toEqual([
                "013_recording_transcripts.sql",
                "014_lecture_generated_content.sql",
                "015_recording_audio.sql",
            ]);
            expect(await runMigrations(db)).toEqual([]);
            expect(await uploads.find(courseId, "recording", lectureId)).toMatchObject({ id: asset.id, uploadStatus: "uploaded" });
            const existingLecture = await db.query("SELECT title, status FROM lectures WHERE id = $1", [lectureId]);
            expect(existingLecture.rows[0]).toEqual({
                title: "Existing lecture",
                status: "uploaded",
            });
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    afterAll(async () => {
        await db.query(`DROP SCHEMA ${schema} CASCADE`);
        await db.end();
    });

    async function resource() {
        const asset = await uploads.initiate("resource", courseId, {
            name: "notes.pdf",
            contentType: "application/pdf",
            contentLength: 10,
        });
        await uploads.complete(asset);

        return { kind: "resource", courseId, resourceId: asset.resourceId! } as const;
    }

    it("reclaims expired provider leases and leaves the subject unlocked during external work", async () => {
        const inserted = await db.query("INSERT INTO lectures(fk_course_id,title) VALUES($1,'Lease') RETURNING id", [courseId]);
        const subject = { kind: "lecture" as const, courseId, lectureId: String(inserted.rows[0].id) };
        const { run } = await repository.begin(subject, ["summary"], 600);
        await db.query(
            "INSERT INTO processing_invocations(course_id,lecture_id,operation,owner,run_id,lease_until) VALUES($1,$2,'summary:hash',$3,$4,now()+interval '1 minute')",
            [courseId, subject.lectureId, randomUUID(), run.id],
        );
        const work = vi.fn(async () => "result");
        await expect(repository.invoke(subject, run.id, "summary:hash", run.deadline, work)).rejects.toMatchObject({
            code: "INVOCATION_BUSY",
        });
        expect(work).not.toHaveBeenCalled();
        await db.query("UPDATE processing_invocations SET lease_until=now()-interval '1 second' WHERE lecture_id=$1", [subject.lectureId]);
        expect(
            await repository.invoke(subject, run.id, "summary:hash", run.deadline, async () => {
                expect(await repository.current(subject)).toMatchObject({ status: "running" });
                await expect(repository.invoke(subject, run.id, "summary:hash", run.deadline, work)).rejects.toMatchObject({
                    code: "INVOCATION_BUSY",
                });

                return "result";
            }),
        ).toBe("result");
        expect(await repository.invoke(subject, run.id, "summary:hash", run.deadline, work)).toBe("result");
        expect(work).toHaveBeenCalledTimes(1);
    });

    it("recovers a committed run abandoned before dispatch without creating another run", async () => {
        const subject = await resource();
        const { run } = await repository.begin(subject, ["extraction"], 600);
        await db.query("UPDATE processing_runs SET started_at=now()-interval '10 seconds' WHERE id=$1", [run.id]);
        const starter = vi.fn(async () => {});
        const service = new ProcessingService(repository, starter);
        await service.recoverStarts();
        await service.recoverStarts();
        expect(starter).toHaveBeenCalledTimes(1);
        expect(starter).toHaveBeenCalledWith(expect.objectContaining({ runId: run.id, input: subject }));
        expect(await repository.current(subject)).toMatchObject({ id: run.id, status: "running" });
    });

    it("deduplicates local delivery, releases failed handoffs and recovers expired delivery leases", async () => {
        const subject = await resource();
        const { run } = await repository.begin(subject, ["extraction"], 600);
        const inbox = new PostgresContinuationInbox(db);
        const body = JSON.stringify({ runId: run.id, deliveryId: "inbox-test" });
        const work = vi.fn(async () => {});
        await inbox.process(body, 60, work);
        await inbox.process(body, 60, work);
        expect(work).toHaveBeenCalledTimes(1);
        const failed = JSON.stringify({ runId: run.id, deliveryId: "inbox-failed" });
        await expect(
            inbox.process(failed, 60, async () => {
                throw new Error("Lost send");
            }),
        ).rejects.toThrow("Lost send");
        await inbox.process(failed, 60, work);
        expect(work).toHaveBeenCalledTimes(2);
        await db.query(
            "INSERT INTO processing_deliveries(delivery_id,run_id,owner,lease_until) VALUES('abandoned',$1,$2,now()+interval '1 minute')",
            [run.id, randomUUID()],
        );
        const abandoned = JSON.stringify({ runId: run.id, deliveryId: "abandoned" });
        await expect(inbox.process(abandoned, 60, work)).rejects.toMatchObject({ code: "DELIVERY_BUSY" });
        await db.query("UPDATE processing_deliveries SET lease_until=now()-interval '1 second' WHERE delivery_id='abandoned'");
        await inbox.process(abandoned, 60, work);
        expect(work).toHaveBeenCalledTimes(3);
    });

    it("serializes concurrent starts and retries, fences stale output and failure writes", async () => {
        const subject = await resource();
        const start = vi.fn(async () => {});
        const service = new ProcessingService(repository, start);
        const runs = await Promise.all(Array.from({ length: 12 }, () => service.start(subject, ["extraction"], 600)));
        expect(new Set(runs.map((run) => run.id)).size).toBe(1);
        expect(start).toHaveBeenCalledTimes(1);
        const first = runs[0]!;
        await repository.fail(subject, first.id, "TEST", "Retry extraction.");
        const retries = await Promise.all(Array.from({ length: 12 }, () => service.start(subject, ["extraction"], 600)));
        expect(new Set(retries.map((run) => run.id)).size).toBe(1);
        expect(start).toHaveBeenCalledTimes(2);
        const second = retries[0]!;
        expect(second.number).toBe(2);
        const stale = new ContentIndexService(
            new PostgresContentIndexRepository(db, (client) => repository.guard(client, subject, first.id)),
        );
        await expect(stale.indexSource(subject, [{ pageNumber: 1, text: "Old output" }])).rejects.toMatchObject({
            name: "SupersededRunError",
        });
        await expect(stale.markFailed(subject, "Old failure")).rejects.toMatchObject({ name: "SupersededRunError" });
        await expect(repository.stage(subject, first.id, "extraction", "succeeded", 1)).rejects.toMatchObject({
            name: "SupersededRunError",
        });
        await repository.fail(subject, first.id, "STALE", "Must not overwrite current run.");
        expect(await repository.current(subject)).toMatchObject({ status: "running" });
        const content = new ContentIndexService(
            new PostgresContentIndexRepository(db, (client) => repository.guard(client, subject, second.id)),
        );
        await content.indexSource(subject, [{ pageNumber: 1, text: "New output" }]);
        // A duplicate reader failing after another commits must preserve the immutable file's index.
        expect(await content.markFailed(subject, "Concurrent read failed")).toMatchObject({ status: "indexed" });
        await repository.stage(subject, second.id, "extraction", "succeeded", 2);
        await repository.stage(subject, second.id, "extraction", "running", 1);
        await repository.fail(subject, second.id, "LATE", "Duplicate failure before terminal continuation");
        expect(await repository.current(subject)).toMatchObject({ status: "running" });
        await repository.succeed(subject, second.id);
        await repository.fail(subject, second.id, "LATE", "Late failure");
        expect(await service.start(subject, ["extraction"], 600)).toMatchObject({ id: second.id });
        expect(await repository.stages(subject)).toMatchObject([{ status: "succeeded", attempts: 2 }]);
        expect(await repository.current(subject)).toMatchObject({ status: "succeeded" });
        const chunks = await db.query("SELECT count(*)::int AS count FROM content_chunks");
        expect(chunks.rows[0].count).toBe(1);
    });

    it("persists rejected and ambiguous start failures and recovers abandoned execution deadlines", async () => {
        const subject = await resource();
        let acceptedRun = "";
        const service = new ProcessingService(repository, async (request) => {
            acceptedRun = request.runId;
            throw new Error("Response lost after queue accepted the send");
        });
        expect(await service.start(subject, ["extraction"], 600)).toMatchObject({ status: "failed", error_code: "START_FAILED" });
        expect(await repository.stages(subject)).toMatchObject([{ status: "failed", error_code: "START_FAILED" }]);
        await expect(repository.stage(subject, acceptedRun, "extraction", "running", 1)).rejects.toMatchObject({
            name: "SupersededRunError",
        });
        const retry = await repository.begin(subject, ["extraction"], 600);
        await db.query("UPDATE processing_runs SET deadline = now() - interval '1 second' WHERE id = $1", [retry.run.id]);
        await repository.expireRuns();
        expect(await repository.current(subject)).toMatchObject({ status: "failed", error_code: "PROCESSING_TIMEOUT" });
        expect(await repository.begin(subject, ["extraction"], 600)).toMatchObject({ run: { number: 3 } });
        const lecture = { kind: "lecture", courseId, lectureId } as const;
        expect(await service.start(lecture, ["verification"], 600)).toMatchObject({ status: "failed" });
        const lectureRow = await db.query("SELECT status FROM lectures WHERE id = $1", [lectureId]);
        expect(lectureRow.rows[0].status).toBe("uploaded");
    });

    it("holds the subject fence until output commits and isolates other subjects and courses", async () => {
        const subject = await resource();
        const other = await resource();
        const first = await repository.begin(subject, ["extraction"], 600);
        await repository.begin(other, ["extraction"], 600);
        const client = await db.connect();
        try {
            await client.query("BEGIN");
            await repository.guard(client, subject, first.run.id);
            let finished = false;
            const failing = repository.fail(subject, first.run.id, "TEST", "Failure").then(() => {
                finished = true;
            });
            const otherRun = await repository.current(other);
            await repository.stage(other, otherRun!.id, "extraction", "running", 1);
            expect(finished).toBe(false);
            await client.query("COMMIT");
            await failing;
        } finally {
            await client.query("ROLLBACK");
            client.release();
        }
        expect(await repository.current(other)).toMatchObject({ status: "running" });
        await expect(repository.begin({ ...subject, courseId: "2147483647" }, ["extraction"], 600)).rejects.toMatchObject({
            name: "SupersededRunError",
        });
        const lectureRow = await db.query("SELECT status FROM lectures WHERE id = $1", [lectureId]);
        expect(lectureRow.rows[0].status).toBe("uploaded");
    });
});
