import { tokenSchema, transcriptSchema, type Transcript, type TranscriptToken } from "../transcript/model.ts";
import type { ChunkPlan } from "./chunk-planner.ts";
import type { RecordingReference, RecordingRepository } from "./model.ts";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

interface ChunkRow {
    position: number;
    start_seconds: number;
    end_seconds: number;
    audio_start_seconds: number;
    provider_job_id: string | null;
    submissions: number;
    submission_run_id: string | null;
    run_submissions: number;
    tokens: unknown;
    media_prepared: boolean;
}
export class PostgresRecordingRepository implements RecordingRepository {
    private readonly db: Pool;
    private readonly beforeWrite: (client: PoolClient) => Promise<void>;
    constructor(db: Pool, beforeWrite: (client: PoolClient) => Promise<void>) {
        this.db = db;
        this.beforeWrite = beforeWrite;
    }
    private async write(operation: (client: PoolClient) => Promise<void>) {
        const client = await this.db.connect();
        try {
            await client.query("BEGIN");
            await this.beforeWrite(client);
            await operation(client);
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }
    async chunks(reference: RecordingReference) {
        const result = await this.db.query<ChunkRow>(
            "SELECT * FROM recording_chunks WHERE course_id=$1 AND lecture_id=$2 AND recording_id=$3 ORDER BY position",
            [reference.courseId, reference.lectureId, reference.recordingId],
        );

        return result.rows.map((row) => ({
            position: row.position,
            mediaPrepared: row.media_prepared,
            startSeconds: row.start_seconds,
            endSeconds: row.end_seconds,
            audioStartSeconds: row.audio_start_seconds,
            submissions: row.submissions,
            submissionRunId: row.submission_run_id ?? undefined,
            runSubmissions: row.run_submissions,
            ...(row.provider_job_id ? { jobId: row.provider_job_id } : {}),
            ...(row.tokens === null ? {} : { tokens: z.array(tokenSchema).parse(row.tokens) }),
        }));
    }
    async savePlan(reference: RecordingReference, chunks: readonly ChunkPlan[], mediaPrepared = false) {
        await this.write(async (client) => {
            for (const chunk of chunks)
                await client.query(
                    `INSERT INTO recording_chunks
                        (course_id, lecture_id, recording_id, position, start_seconds, end_seconds, audio_start_seconds, media_prepared)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
                    [
                        reference.courseId,
                        reference.lectureId,
                        reference.recordingId,
                        chunk.position,
                        chunk.startSeconds,
                        chunk.endSeconds,
                        chunk.audioStartSeconds,
                        mediaPrepared,
                    ],
                );
        });
    }
    async submit(reference: RecordingReference, position: number, jobId: string, runId: string) {
        await this.write(async (client) => {
            await client.query(
                `UPDATE recording_chunks SET provider_job_id=$5, submissions=submissions+1,
                    submission_run_id=$6,
                    run_submissions=CASE WHEN submission_run_id=$6 THEN run_submissions+1 ELSE 1 END
                 WHERE course_id=$1 AND lecture_id=$2 AND recording_id=$3 AND position=$4
                    AND provider_job_id IS NULL AND tokens IS NULL`,
                [reference.courseId, reference.lectureId, reference.recordingId, position, jobId, runId],
            );
        });
    }
    async resetJob(reference: RecordingReference, position: number, jobId: string) {
        await this.write(async (client) => {
            await client.query(
                "UPDATE recording_chunks SET provider_job_id=NULL WHERE course_id=$1 AND lecture_id=$2 AND recording_id=$3 AND position=$4 AND provider_job_id=$5 AND tokens IS NULL",
                [reference.courseId, reference.lectureId, reference.recordingId, position, jobId],
            );
        });
    }
    async collect(reference: RecordingReference, position: number, tokens: TranscriptToken[]) {
        const parsed = z.array(tokenSchema).parse(tokens);
        await this.write(async (client) => {
            await client.query(
                "UPDATE recording_chunks SET tokens=$5::jsonb WHERE course_id=$1 AND lecture_id=$2 AND recording_id=$3 AND position=$4 AND tokens IS NULL",
                [reference.courseId, reference.lectureId, reference.recordingId, position, JSON.stringify(parsed)],
            );
        });
    }
    async transcript(courseId: string, lectureId: string) {
        const result = await this.db.query<{ content: unknown }>(
            "SELECT content FROM lecture_transcripts WHERE course_id=$1 AND lecture_id=$2",
            [courseId, lectureId],
        );

        return result.rows[0] ? transcriptSchema.parse(result.rows[0].content) : undefined;
    }
    async saveTranscript(reference: RecordingReference, transcript: Transcript) {
        const parsed = transcriptSchema.parse(transcript);
        await this.write(async (client) => {
            await client.query(
                `INSERT INTO lecture_transcripts(course_id, lecture_id, recording_id, content_hash, content)
                 VALUES ($1, $2, $3, $4, $5::jsonb)
                 ON CONFLICT (lecture_id) DO UPDATE
                 SET content_hash=EXCLUDED.content_hash, content=EXCLUDED.content, updated_at=now()
                 WHERE lecture_transcripts.content_hash <> EXCLUDED.content_hash`,
                [reference.courseId, reference.lectureId, reference.recordingId, parsed.contentHash, JSON.stringify(parsed)],
            );
        });
    }
}
