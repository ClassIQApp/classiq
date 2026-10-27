import type { ContentIndexService } from "./content-index-service.ts";
import { ContentIndexError } from "./errors.ts";
import type { ContentSource } from "./model.ts";
import { extractPdfPages } from "./pdf-text-extractor.ts";
import { ResourceContentIndexer } from "./resource-content-indexer.ts";
import { createTestPdf } from "./test-pdf.ts";
import { describe, expect, it, vi } from "vitest";

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

        const result = await indexer.index(resource, async () => createTestPdf(["Cell membranes", "Osmosis"]));

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

        const result = await indexer.index(resource, async () => createTestPdf([""]));

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

        const result = await indexer.index(resource, read);

        expect(result.status).toBe("failed");
        expect(service.indexSource).not.toHaveBeenCalled();
        expect(service.markFailed.mock.calls[0]![1]).not.toMatch(/S3|garbage/);
    });

    it("propagates invalid references instead of recording them", async () => {
        const { service, indexer } = fixture(async () => {
            throw new ContentIndexError("invalid_reference");
        });

        await expect(indexer.index(resource, async () => createTestPdf(["Text"]))).rejects.toThrow(ContentIndexError);
        expect(service.markFailed).not.toHaveBeenCalled();
    });
});
