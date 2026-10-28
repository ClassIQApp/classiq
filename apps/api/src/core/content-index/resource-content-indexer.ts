import type { ContentIndexService } from "./content-index-service.ts";
import { ContentIndexError } from "./errors.ts";
import type { ContentSource, ResourcePage } from "./model.ts";
import { extractPdfPages } from "./pdf-text-extractor.ts";

export interface ResourceReference {
    readonly courseId: string;
    readonly resourceId: string;
}

export type ResourceIndexingService = Pick<ContentIndexService, "indexSource" | "markFailed">;

/** Indexes uploaded PDF resources, recording failures on the source instead of throwing them. */
export class ResourceContentIndexer {
    private readonly service: ResourceIndexingService;
    private readonly extractPages: (data: Uint8Array) => Promise<ResourcePage[]>;

    constructor(service: ResourceIndexingService, extractPages = extractPdfPages) {
        this.service = service;
        this.extractPages = extractPages;
    }

    async index(resource: ResourceReference, read: () => Promise<Uint8Array>): Promise<ContentSource> {
        const reference = { kind: "resource", ...resource } as const;

        try {
            return await this.service.indexSource(reference, await this.extractPages(await read()));
        } catch (error) {
            if (error instanceof ContentIndexError && error.code === "invalid_reference") {
                throw error;
            }

            const message =
                error instanceof ContentIndexError && error.code === "empty_content"
                    ? "The PDF has no extractable text. Scanned documents are not supported yet."
                    : "The PDF could not be indexed. Try uploading it again.";

            return this.service.markFailed(reference, message);
        }
    }
}
