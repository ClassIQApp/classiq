import { type ResourceFormat, resourceFormatOf } from "../uploads/resource-formats.ts";
import { extractDocxPages } from "./docx-text-extractor.ts";
import { UnreadableResourceError } from "./errors.ts";
import type { ResourcePage } from "./model.ts";
import { extractPdfPages } from "./pdf-text-extractor.ts";
import { extractPptxPages } from "./pptx-text-extractor.ts";

const extractors: Record<ResourceFormat, (data: Uint8Array) => ResourcePage[] | Promise<ResourcePage[]>> = {
    pdf: extractPdfPages,
    docx: extractDocxPages,
    pptx: extractPptxPages,
};

/** Extracts the text of an uploaded resource as numbered pages (PDF pages, PowerPoint slides, Word sections). */
export async function extractResourcePages(contentType: string, data: Uint8Array): Promise<ResourcePage[]> {
    const format = resourceFormatOf(contentType);

    if (!format) {
        throw new UnreadableResourceError("corrupt");
    }

    return extractors[format](data);
}
