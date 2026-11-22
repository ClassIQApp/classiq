import { RESOURCE_CONTENT_TYPES } from "../uploads/resource-formats.ts";
import type { ContentIndexService } from "./content-index-service.ts";
import { ContentIndexError } from "./errors.ts";
import type { ContentSource } from "./model.ts";
import { extractPdfPages } from "./pdf-text-extractor.ts";
import { ResourceContentIndexer } from "./resource-content-indexer.ts";
import { createTestDocx, createTestPptx } from "./test-office.ts";
import { createTestPdf } from "./test-pdf.ts";
import { describe, expect, it, vi } from "vitest";

const PDF = RESOURCE_CONTENT_TYPES.pdf;
const resource = { courseId: "1", resourceId: "3" };
const reference = { kind: "resource", ...resource } as const;

function fixture(indexSource: ContentIndexService["indexSource"] = async (_, sections) => source("indexed", sections.length)) {
    const service = {
        indexSource: vi.fn(indexSource),
        markFailed: vi.fn(async (_: unknown, message: string) => ({ ...source("failed", 0), statusMessage: message })),
    };

    return { service, indexer: new ResourceContentIndexer(service) };
}

function source(status: ContentSource["status"], chunkCount: number): ContentSource {
    return { id: "9", reference, status, statusMessage: "", chunkCount };
}

describe("extractPdfPages", () => {
    it("extracts text per page and keeps page numbers", async () => {
        const pages = await extractPdfPages(createTestPdf(["Mitochondria produce ATP", "", "Ribosomes build proteins"]));

        expect(pages.map((page) => page.pageNumber)).toEqual([1, 2, 3]);
        expect(pages[0]!.text).toContain("Mitochondria produce ATP");
        expect(pages[1]!.text.trim()).toBe("");
        expect(pages[2]!.text).toContain("Ribosomes build proteins");
    });

    it("rejects data that is not a PDF", async () => {
        await expect(extractPdfPages(new TextEncoder().encode("not a pdf"))).rejects.toThrow();
    });
});

describe("ResourceContentIndexer", () => {
    it("indexes the extracted pages of an uploaded PDF", async () => {
        const { service, indexer } = fixture();

        const result = await indexer.index(resource, PDF, async () => createTestPdf(["Cell membranes", "Osmosis"]));

        expect(result.status).toBe("indexed");
        expect(service.indexSource).toHaveBeenCalledWith(reference, [
            expect.objectContaining({ pageNumber: 1, text: expect.stringContaining("Cell membranes") }),
            expect.objectContaining({ pageNumber: 2, text: expect.stringContaining("Osmosis") }),
        ]);
    });

    it("records scanned PDFs without a text layer as failed", async () => {
        const { service, indexer } = fixture(async () => {
            throw new ContentIndexError("empty_content");
        });

        const result = await indexer.index(resource, PDF, async () => createTestPdf([""]));

        expect(result.status).toBe("failed");
        expect(service.markFailed).toHaveBeenCalledWith(reference, expect.stringContaining("no extractable text"));
    });

    it.each([
        [
            "storage failures",
            async () => {
                throw new Error("S3 down");
            },
        ],
        ["unreadable files", async () => new TextEncoder().encode("garbage")],
    ])("records %s as failed without leaking details", async (_, read) => {
        const { service, indexer } = fixture();

        const result = await indexer.index(resource, PDF, read);

        expect(result.status).toBe("failed");
        expect(service.indexSource).not.toHaveBeenCalled();
        expect(service.markFailed.mock.calls[0]![1]).not.toMatch(/S3|garbage/);
    });

    it.each([
        ["Word document", RESOURCE_CONTENT_TYPES.docx, createTestDocx([{ text: "Glycolysis occurs in the cytoplasm" }])],
        ["PowerPoint presentation", RESOURCE_CONTENT_TYPES.pptx, createTestPptx([["Krebs cycle"], ["Electron transport chain"]])],
    ])("indexes a %s through the same pages", async (_, contentType, file) => {
        const { service, indexer } = fixture();

        const result = await indexer.index(resource, contentType, async () => file);

        expect(result.status).toBe("indexed");
        expect(service.indexSource).toHaveBeenCalledWith(reference, expect.arrayContaining([expect.objectContaining({ pageNumber: 1 })]));
    });

    it("tells the teacher when an Office file is encrypted or unreadable", async () => {
        const encrypted = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
        const { service, indexer } = fixture();

        await indexer.index(resource, RESOURCE_CONTENT_TYPES.docx, async () => encrypted);
        await indexer.index(resource, RESOURCE_CONTENT_TYPES.pptx, async () => new TextEncoder().encode("not a zip"));

        expect(service.indexSource).not.toHaveBeenCalled();
        expect(service.markFailed.mock.calls.map((call) => call[1])).toEqual([
            expect.stringMatching(/Word document is password-protected/),
            expect.stringMatching(/PowerPoint presentation could not be read/),
        ]);
    });

    it("records a presentation without any text as failed", async () => {
        const { service, indexer } = fixture(async () => {
            throw new ContentIndexError("empty_content");
        });

        await indexer.index(resource, RESOURCE_CONTENT_TYPES.pptx, async () => createTestPptx([[], []]));

        expect(service.markFailed).toHaveBeenCalledWith(
            reference,
            expect.stringContaining("PowerPoint presentation has no extractable text"),
        );
    });

    it("propagates invalid references instead of recording them", async () => {
        const { service, indexer } = fixture(async () => {
            throw new ContentIndexError("invalid_reference");
        });

        await expect(indexer.index(resource, PDF, async () => createTestPdf(["Text"]))).rejects.toThrow(ContentIndexError);
        expect(service.markFailed).not.toHaveBeenCalled();
    });
});
