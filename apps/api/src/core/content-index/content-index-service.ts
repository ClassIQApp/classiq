import { chunkSections, DEFAULT_CHUNKING, type ChunkingOptions } from "./chunker.ts";
import type { ContentIndexRepository } from "./content-index-repository.ts";
import { ContentIndexError } from "./errors.ts";
import {
    contentSearchQuerySchema,
    contentSourceReferenceSchema,
    resourcePageSchema,
    transcriptSegmentSchema,
    type ContentPassage,
    type ContentSearchQuery,
    type ContentSection,
    type ContentSource,
    type ContentSourceReference,
} from "./model.ts";
import { createHash } from "node:crypto";
import * as z from "zod/mini";

const sectionsSchemaByKind = {
    transcript: z.array(transcriptSegmentSchema),
    resource: z.array(resourcePageSchema),
} as const;

const MAX_STATUS_MESSAGE_LENGTH = 500;

interface ContentIndexServiceOptions {
    readonly chunking?: ChunkingOptions;
}

export class ContentIndexService {
    private readonly repository: ContentIndexRepository;
    private readonly chunking: ChunkingOptions;

    constructor(repository: ContentIndexRepository, options: ContentIndexServiceOptions = {}) {
        this.repository = repository;
        this.chunking = options.chunking ?? DEFAULT_CHUNKING;
    }

    /**
     * Indexes transcript segments or resource pages for a source, replacing anything indexed before.
     * Re-indexing identical content is a no-op.
     */
    async indexSource(reference: ContentSourceReference, sections: readonly ContentSection[]): Promise<ContentSource> {
        const parsedReference = this.parseReference(reference);
        const parsedSections = sectionsSchemaByKind[parsedReference.kind].safeParse(sections);

        if (!parsedSections.success) {
            throw new ContentIndexError("invalid_content");
        }

        const chunks = chunkSections(parsedSections.data, this.chunking);

        if (chunks.length === 0) {
            throw new ContentIndexError("empty_content");
        }

        const contentHash = createHash("sha256").update(JSON.stringify(chunks)).digest("hex");
        const existing = await this.repository.findSource(parsedReference);

        if (existing?.status === "indexed" && existing.contentHash === contentHash) {
            return existing;
        }

        return this.repository.replaceChunks(parsedReference, contentHash, chunks);
    }

    /** Records why a source could not be indexed; the message is shown to teachers. */
    async markFailed(reference: ContentSourceReference, message: string): Promise<ContentSource> {
        return this.repository.markFailed(this.parseReference(reference), message.slice(0, MAX_STATUS_MESSAGE_LENGTH));
    }

    async search(query: ContentSearchQuery): Promise<ContentPassage[]> {
        const parsedQuery = contentSearchQuerySchema.safeParse(query);

        if (!parsedQuery.success) {
            throw new ContentIndexError("invalid_query");
        }

        return this.repository.search(parsedQuery.data);
    }

    private parseReference(reference: ContentSourceReference): ContentSourceReference {
        const parsedReference = contentSourceReferenceSchema.safeParse(reference);

        if (!parsedReference.success) {
            throw new ContentIndexError("invalid_reference");
        }

        return parsedReference.data;
    }
}
