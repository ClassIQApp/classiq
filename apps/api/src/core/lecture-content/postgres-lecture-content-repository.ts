import { PermanentStageError } from "../processing/pipeline.ts";
import {
    summarySchema,
    keyTermsSchema,
    type ContentKind,
    type LectureContentRepository,
    type LectureReference,
    type StoredContent,
} from "./model.ts";
import type { Pool, PoolClient } from "pg";

export class PostgresLectureContentRepository implements LectureContentRepository {
    private readonly db: Pool;
    private readonly beforeWrite: (client: PoolClient) => Promise<void>;
    constructor(db: Pool, beforeWrite: (client: PoolClient) => Promise<void>) {
        this.db = db;
        this.beforeWrite = beforeWrite;
    }
    async read(reference: LectureReference, kind: ContentKind): Promise<StoredContent | undefined> {
        const result = await this.db.query<{ content: unknown; source_hash: string; provider: string; model: string }>(
            "SELECT * FROM lecture_generated_content WHERE course_id=$1 AND lecture_id=$2 AND kind=$3",
            [reference.courseId, reference.lectureId, kind],
        );
        const row = result.rows[0];
        if (!row) return undefined;
        const metadata = { sourceHash: row.source_hash, provider: row.provider, model: row.model };

        return kind === "summary"
            ? { ...metadata, kind, content: summarySchema.parse(row.content) }
            : { ...metadata, kind, content: keyTermsSchema.parse(row.content) };
    }
    async save(reference: LectureReference, output: StoredContent) {
        const content = output.kind === "summary" ? summarySchema.parse(output.content) : keyTermsSchema.parse(output.content);
        const client = await this.db.connect();
        try {
            await client.query("BEGIN");
            await this.beforeWrite(client);
            const transcript = await client.query<{ content_hash: string }>(
                "SELECT content_hash FROM lecture_transcripts WHERE course_id=$1 AND lecture_id=$2",
                [reference.courseId, reference.lectureId],
            );
            if (transcript.rows[0]?.content_hash !== output.sourceHash)
                throw new PermanentStageError("TRANSCRIPT_CHANGED", "The transcript changed. Retry processing.");
            await client.query(
                `INSERT INTO lecture_generated_content(course_id,lecture_id,kind,content,source_hash,provider,model)
                 VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)
                 ON CONFLICT (lecture_id,kind) DO UPDATE SET content=EXCLUDED.content, source_hash=EXCLUDED.source_hash,
                 provider=EXCLUDED.provider, model=EXCLUDED.model, updated_at=now()
                 WHERE lecture_generated_content.source_hash <> EXCLUDED.source_hash`,
                [
                    reference.courseId,
                    reference.lectureId,
                    output.kind,
                    JSON.stringify(content),
                    output.sourceHash,
                    output.provider,
                    output.model,
                ],
            );
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }
}
