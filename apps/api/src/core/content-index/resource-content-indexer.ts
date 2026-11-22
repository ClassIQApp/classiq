import { SupersededRunError } from "../processing/postgres-processing-repository.ts";
import { resourceFormatLabels, resourceFormatOf } from "../uploads/resource-formats.ts";
import type { ContentIndexService } from "./content-index-service.ts";
import { ContentIndexError, UnreadableResourceError } from "./errors.ts";
import type { ContentSource, ResourcePage } from "./model.ts";
import { extractResourcePages } from "./resource-text-extractor.ts";

export interface ResourceReference {
    readonly courseId: string;
    readonly resourceId: string;
}

export type ResourceIndexingService = Pick<ContentIndexService, "indexSource" | "markFailed">;

/** Indexes uploaded PDF, Word and PowerPoint resources, recording failures on the source instead of throwing them. */
export class ResourceContentIndexer {
    private readonly service: ResourceIndexingService;
    private readonly extractPages: (contentType: string, data: Uint8Array) => Promise<ResourcePage[]>;

    constructor(service: ResourceIndexingService, extractPages = extractResourcePages) {
        this.service = service;
        this.extractPages = extractPages;
    }

    async index(resource: ResourceReference, contentType: string, read: () => Promise<Uint8Array>): Promise<ContentSource> {
        const reference = { kind: "resource", ...resource } as const;

        try {
            return await this.service.indexSource(reference, await this.extractPages(contentType, await read()));
        } catch (error) {
            if (error instanceof SupersededRunError || (error instanceof ContentIndexError && error.code === "invalid_reference")) {
                throw error;
            }

            return this.service.markFailed(reference, failureMessage(contentType, error));
        }
    }
}

function failureMessage(contentType: string, error: unknown): string {
    const format = resourceFormatOf(contentType);
    const label = format ? `The ${resourceFormatLabels[format]}` : "The file";

    if (error instanceof UnreadableResourceError) {
        return error.reason === "protected"
            ? `${label} is password-protected. Remove the password and upload it again.`
            : `${label} could not be read. It may be corrupt or in an unsupported format; export it again and upload the new file.`;
    }

    if (error instanceof ContentIndexError && error.code === "empty_content") {
        return format === "pdf"
            ? `${label} has no extractable text. Scanned documents are not supported yet.`
            : `${label} has no extractable text. Text inside images is not supported yet.`;
    }

    return `${label} could not be indexed. Try uploading it again.`;
}
