import type { ContentIndexRepository } from "./content-index-repository.ts";
import { ContentIndexError } from "./errors.ts";
import type {
    ContentChunk,
    ContentLocation,
    ContentPassage,
    ContentScope,
    ContentSource,
    ContentSourceKind,
    ContentSourceReference,
    ContentSourceStatus,
    IndexedPassage,
    ParsedContentSearchQuery,
} from "./model.ts";
import { DatabaseError, type Pool, type PoolClient } from "pg";

const SOURCE_COLUMNS = `
    id,
    course_id,
    kind,
    lecture_id,
    resource_id,
    status,
    status_message,
    content_hash,
    indexed_at,
    (SELECT count(*) FROM content_chunks WHERE content_chunks.source_id = content_sources.id) AS chunk_count
`;

const PASSAGE_COLUMNS = `
    chunk.id,
    source.kind,
    source.course_id,
    COALESCE(source.lecture_id, resource.fk_lecture_id) AS lecture_id,
    source.resource_id,
    COALESCE(lecture.title, resource.name, '') AS title,
    chunk.content,
    chunk.page_number,
    chunk.start_seconds,
    chunk.end_seconds
`;

const PASSAGE_JOINS = `
    JOIN content_sources AS source ON source.id = chunk.source_id
    LEFT JOIN lectures AS lecture ON lecture.id = source.lecture_id
    LEFT JOIN course_resources AS resource ON resource.id = source.resource_id
`;

interface SourceRow {
    id: number;
    course_id: number;
    kind: ContentSourceKind;
    lecture_id: number | null;
    resource_id: number | null;
    status: ContentSourceStatus;
    status_message: string;
    content_hash: string | null;
    indexed_at: Date | null;
    chunk_count: string;
}

interface PassageRow {
    id: number;
    kind: ContentSourceKind;
    course_id: number;
    lecture_id: number | null;
    resource_id: number | null;
    title: string;
    content: string;
    page_number: number | null;
    start_seconds: number | null;
    end_seconds: number | null;
}

interface ScoredPassageRow extends PassageRow {
    score: number;
}

function toSource(row: SourceRow): ContentSource {
    const courseId = String(row.course_id);

    return {
        id: String(row.id),
        reference:
            row.kind === "transcript"
                ? { kind: "transcript", courseId, lectureId: String(row.lecture_id) }
                : { kind: "resource", courseId, resourceId: String(row.resource_id) },
        status: row.status,
        statusMessage: row.status_message,
        ...(row.content_hash === null ? {} : { contentHash: row.content_hash }),
        chunkCount: Number(row.chunk_count),
        ...(row.indexed_at === null ? {} : { indexedAt: row.indexed_at.toISOString() }),
    };
}

function toLocation(row: Pick<PassageRow, "page_number" | "start_seconds" | "end_seconds">): ContentLocation {
    return row.page_number === null ? { startSeconds: row.start_seconds!, endSeconds: row.end_seconds! } : { pageNumber: row.page_number };
}

function toPassage(row: PassageRow): IndexedPassage {
    return {
        id: String(row.id),
        kind: row.kind,
        courseId: String(row.course_id),
        ...(row.lecture_id === null ? {} : { lectureId: String(row.lecture_id) }),
        ...(row.resource_id === null ? {} : { resourceId: String(row.resource_id) }),
        title: row.title,
        content: row.content,
        ...toLocation(row),
    };
}

function sourceKey(reference: ContentSourceReference) {
    return reference.kind === "transcript"
        ? { lectureId: reference.lectureId, resourceId: null, conflict: "(lecture_id) WHERE kind = 'transcript'" }
        : { lectureId: null, resourceId: reference.resourceId, conflict: "(resource_id) WHERE kind = 'resource'" };
}

export class PostgresContentIndexRepository implements ContentIndexRepository {
    private readonly db: Pool;

    constructor(db: Pool) {
        this.db = db;
    }

    async findSource(reference: ContentSourceReference): Promise<ContentSource | undefined> {
        const { lectureId, resourceId } = sourceKey(reference);

        const result = await this.db.query<SourceRow>(
            `
            SELECT ${SOURCE_COLUMNS}
            FROM content_sources
            WHERE course_id = $1
                AND kind = $2
                AND (lecture_id = $3 OR resource_id = $4)
            `,
            [reference.courseId, reference.kind, lectureId, resourceId],
        );

        return result.rows[0] ? toSource(result.rows[0]) : undefined;
    }

    async replaceChunks(reference: ContentSourceReference, contentHash: string, chunks: readonly ContentChunk[]): Promise<ContentSource> {
        return this.transaction(async (client) => {
            const sourceId = await this.upsertSource(client, reference, "indexed", "", contentHash);

            await client.query("DELETE FROM content_chunks WHERE source_id = $1", [sourceId]);
            await client.query(
                `
                INSERT INTO content_chunks (source_id, course_id, position, content, page_number, start_seconds, end_seconds)
                SELECT $1, $2, chunk.*
                FROM unnest($3::int[], $4::text[], $5::int[], $6::float8[], $7::float8[]) AS chunk
                `,
                [
                    sourceId,
                    reference.courseId,
                    chunks.map((chunk) => chunk.position),
                    chunks.map((chunk) => chunk.content),
                    chunks.map((chunk) => chunk.pageNumber ?? null),
                    chunks.map((chunk) => chunk.startSeconds ?? null),
                    chunks.map((chunk) => chunk.endSeconds ?? null),
                ],
            );

            return this.readSource(client, sourceId);
        });
    }

    async markFailed(reference: ContentSourceReference, message: string): Promise<ContentSource> {
        return this.transaction(async (client) => {
            const sourceId = await this.upsertSource(client, reference, "failed", message, null);

            await client.query("DELETE FROM content_chunks WHERE source_id = $1", [sourceId]);

            return this.readSource(client, sourceId);
        });
    }

    async search(query: ParsedContentSearchQuery): Promise<ContentPassage[]> {
        const result = await this.db.query<ScoredPassageRow>(
            `
            SELECT ${PASSAGE_COLUMNS}, ts_rank_cd(chunk.search_vector, query.terms) AS score
            FROM content_chunks AS chunk
            CROSS JOIN websearch_to_tsquery('english', $2) AS query(terms)
            ${PASSAGE_JOINS}
            WHERE chunk.course_id = $1
                AND source.status = 'indexed'
                AND chunk.search_vector @@ query.terms
                AND ($3::int IS NULL OR source.lecture_id = $3 OR resource.fk_lecture_id = $3)
                AND ($4::text[] IS NULL OR source.kind = ANY($4))
            ORDER BY score DESC, chunk.id
            LIMIT $5
            `,
            [query.courseId, query.text, query.lectureId ?? null, query.kinds ?? null, query.limit],
        );

        return result.rows.map((row) => ({ ...toPassage(row), score: row.score }));
    }

    async listPassages(scope: ContentScope, limit: number): Promise<IndexedPassage[]> {
        const result = await this.db.query<PassageRow>(
            `
            SELECT ${PASSAGE_COLUMNS}
            FROM content_chunks AS chunk
            ${PASSAGE_JOINS}
            WHERE chunk.course_id = $1
                AND source.status = 'indexed'
                AND ($2::int IS NULL OR source.lecture_id = $2 OR resource.fk_lecture_id = $2)
            ORDER BY source.kind DESC, source.id, chunk.position
            LIMIT $3
            `,
            [scope.courseId, scope.lectureId ?? null, limit],
        );

        return result.rows.map((row) => toPassage(row));
    }

    private async upsertSource(
        client: PoolClient,
        reference: ContentSourceReference,
        status: ContentSourceStatus,
        message: string,
        contentHash: string | null,
    ): Promise<number> {
        const { lectureId, resourceId, conflict } = sourceKey(reference);
        let result;

        try {
            result = await client.query<{ id: number }>(
                `
                INSERT INTO content_sources (course_id, kind, lecture_id, resource_id, status, status_message, content_hash, indexed_at)
                VALUES ($1, $2, $3, $4, $5::text, $6, $7, CASE WHEN $5::text = 'indexed' THEN now() END)
                ON CONFLICT ${conflict} DO UPDATE SET
                    status = EXCLUDED.status,
                    status_message = EXCLUDED.status_message,
                    content_hash = EXCLUDED.content_hash,
                    indexed_at = COALESCE(EXCLUDED.indexed_at, content_sources.indexed_at),
                    updated_at = now()
                -- a lecture or resource id from another course conflicts with that course's source; never touch it
                WHERE content_sources.course_id = EXCLUDED.course_id
                RETURNING id
                `,
                [reference.courseId, reference.kind, lectureId, resourceId, status, message, contentHash],
            );
        } catch (error) {
            if (error instanceof DatabaseError && error.code === "23503") {
                throw new ContentIndexError("not_found");
            }

            throw error;
        }

        if (!result.rows[0]) {
            throw new ContentIndexError("not_found");
        }

        return result.rows[0].id;
    }

    private async readSource(client: PoolClient, sourceId: number): Promise<ContentSource> {
        const result = await client.query<SourceRow>(`SELECT ${SOURCE_COLUMNS} FROM content_sources WHERE id = $1`, [sourceId]);

        return toSource(result.rows[0]!);
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
}
