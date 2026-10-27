import type { ContentChunk, ContentPassage, ContentSource, ContentSourceReference, ParsedContentSearchQuery } from "./model.ts";

export interface ContentIndexRepository {
    findSource(reference: ContentSourceReference): Promise<ContentSource | undefined>;

    /** Atomically replaces every chunk of the source and marks it indexed. */
    replaceChunks(reference: ContentSourceReference, contentHash: string, chunks: readonly ContentChunk[]): Promise<ContentSource>;

    /** Marks the source failed and removes its chunks so stale content is never retrieved. */
    markFailed(reference: ContentSourceReference, message: string): Promise<ContentSource>;

    search(query: ParsedContentSearchQuery): Promise<ContentPassage[]>;
}
