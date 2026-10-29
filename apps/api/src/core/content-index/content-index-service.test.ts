import type { ContentIndexRepository } from "./content-index-repository.ts";
import { ContentIndexService } from "./content-index-service.ts";
import { ContentIndexError } from "./errors.ts";
import type { ContentSource, ContentSourceReference } from "./model.ts";
import { describe, expect, it, vi } from "vitest";

const transcript: ContentSourceReference = { kind: "transcript", courseId: "1", lectureId: "2" };
const resource: ContentSourceReference = { kind: "resource", courseId: "1", resourceId: "3" };

function fixture() {
    const sources = new Map<string, ContentSource>();
    const repository = {
        findSource: vi.fn(async (reference: ContentSourceReference) => sources.get(JSON.stringify(reference))),
        replaceChunks: vi.fn(async (reference: ContentSourceReference, contentHash: string, chunks: readonly unknown[]) => {
            const source: ContentSource = {
                id: "9",
                reference,
                status: "indexed",
                statusMessage: "",
                contentHash,
                chunkCount: chunks.length,
            };

            sources.set(JSON.stringify(reference), source);

            return source;
        }),
        markFailed: vi.fn(async (reference: ContentSourceReference, statusMessage: string) => {
            const source: ContentSource = { id: "9", reference, status: "failed", statusMessage, chunkCount: 0 };

            sources.set(JSON.stringify(reference), source);

            return source;
        }),
        search: vi.fn(async () => []),
        listPassages: vi.fn(async () => []),
    } satisfies ContentIndexRepository;

    return { repository, service: new ContentIndexService(repository) };
}

async function rejection(promise: Promise<unknown>) {
    const error = await promise.then(
        () => undefined,
        (error: unknown) => error,
    );

    expect(error).toBeInstanceOf(ContentIndexError);

    return (error as ContentIndexError).code;
}

describe("ContentIndexService", () => {
    it("indexes transcript segments and skips re-indexing identical content", async () => {
        const { repository, service } = fixture();
        const segments = [{ startSeconds: 0, endSeconds: 3, text: "Photosynthesis converts light." }];

        const first = await service.indexSource(transcript, segments);
        const second = await service.indexSource(transcript, segments);

        expect(first).toMatchObject({ status: "indexed", chunkCount: 1 });
        expect(second).toBe(first);
        expect(repository.replaceChunks).toHaveBeenCalledTimes(1);
    });

    it("replaces chunks when content changes", async () => {
        const { repository, service } = fixture();

        await service.indexSource(resource, [{ pageNumber: 1, text: "Version one." }]);
        await service.indexSource(resource, [{ pageNumber: 1, text: "Version two." }]);

        expect(repository.replaceChunks).toHaveBeenCalledTimes(2);
        expect(repository.replaceChunks.mock.calls[1]![2]).toEqual([{ position: 0, content: "Version two.", pageNumber: 1 }]);
    });

    it("re-indexes a source that previously failed", async () => {
        const { repository, service } = fixture();
        const pages = [{ pageNumber: 1, text: "Recovered." }];

        await service.markFailed(resource, "Broken");
        await service.indexSource(resource, pages);

        expect(repository.replaceChunks).toHaveBeenCalledTimes(1);
    });

    it.each([
        ["a resource page on a transcript", transcript, [{ pageNumber: 1, text: "Wrong shape." }]],
        ["a transcript segment on a resource", resource, [{ startSeconds: 0, endSeconds: 1, text: "Wrong shape." }]],
        ["a segment ending before it starts", transcript, [{ startSeconds: 5, endSeconds: 1, text: "Backwards." }]],
        ["a non-finite timestamp", transcript, [{ startSeconds: 0, endSeconds: Infinity, text: "Forever." }]],
        ["page zero", resource, [{ pageNumber: 0, text: "Zero." }]],
    ])("rejects %s", async (_, reference, sections) => {
        const { repository, service } = fixture();

        expect(await rejection(service.indexSource(reference, sections))).toBe("invalid_content");
        expect(repository.replaceChunks).not.toHaveBeenCalled();
    });

    it("rejects content with no text", async () => {
        const { service } = fixture();

        expect(await rejection(service.indexSource(resource, [{ pageNumber: 1, text: "  " }]))).toBe("empty_content");
    });

    it.each([
        { kind: "transcript", courseId: "1" },
        { kind: "resource", courseId: "0", resourceId: "3" },
        { kind: "resource", courseId: "1", resourceId: "3; DROP TABLE" },
        { kind: "video", courseId: "1", lectureId: "2" },
    ])("rejects invalid reference %o", async (reference) => {
        const { service } = fixture();

        expect(await rejection(service.indexSource(reference as ContentSourceReference, []))).toBe("invalid_reference");
    });

    it("truncates failure messages", async () => {
        const { repository, service } = fixture();

        await service.markFailed(resource, "x".repeat(1000));

        expect(repository.markFailed.mock.calls[0]![1]).toHaveLength(500);
    });

    it("applies search defaults and trims the query", async () => {
        const { repository, service } = fixture();

        await service.search({ courseId: "1", text: "  enzymes  " });

        expect(repository.search).toHaveBeenCalledWith({ courseId: "1", text: "enzymes", limit: 8 });
    });

    it.each([
        { courseId: "1", text: "   " },
        { courseId: "1", text: "x".repeat(501) },
        { courseId: "abc", text: "enzymes" },
        { courseId: "1", text: "enzymes", limit: 0 },
        { courseId: "1", text: "enzymes", limit: 21 },
        { courseId: "1", text: "enzymes", limit: Number.NaN },
        { courseId: "1", text: "enzymes", kinds: [] },
        { courseId: "1", text: "enzymes", kinds: ["video"] },
        { courseId: "1", text: "enzymes", lectureId: "-1" },
    ])("rejects invalid search %o", async (query) => {
        const { repository, service } = fixture();

        expect(await rejection(service.search(query as never))).toBe("invalid_query");
        expect(repository.search).not.toHaveBeenCalled();
    });

    it("lists passages for a course or lecture with a bounded limit", async () => {
        const { repository, service } = fixture();

        await service.listPassages({ courseId: "1", lectureId: "2" });

        expect(repository.listPassages).toHaveBeenCalledWith({ courseId: "1", lectureId: "2" }, 2000);
    });

    it.each([{ courseId: "0" }, { courseId: "1", lectureId: "x" }])("rejects invalid passage scope %o", async (scope) => {
        const { repository, service } = fixture();

        expect(await rejection(service.listPassages(scope))).toBe("invalid_query");
        expect(repository.listPassages).not.toHaveBeenCalled();
    });
});
