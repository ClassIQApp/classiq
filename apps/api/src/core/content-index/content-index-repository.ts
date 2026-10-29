import type {
    ContentChunk,
    ContentPassage,
    ContentScope,
    ContentSource,
    ContentSourceReference,
    IndexedPassage,
    ParsedContentSearchQuery,
} from "./model.ts";

export interface ContentIndexRepository {
    findSource(reference: ContentSourceReference): Promise<ContentSource | undefined>;

    /** Atomically replaces every chunk of the source and marks it indexed. */
    replaceChunks(reference: ContentSourceReference, contentHash: string, chunks: readonly ContentChunk[]): Promise<ContentSource>;

    /** Marks the source failed and removes its chunks so stale content is never retrieved. */
    markFailed(reference: ContentSourceReference, message: string): Promise<ContentSource>;

    search(query: ParsedContentSearchQuery): Promise<ContentPassage[]>;

    /** Lists indexed passages in reading order: transcripts first, then resources, each by position. */
    listPassages(scope: ContentScope, limit: number): Promise<IndexedPassage[]>;
}
