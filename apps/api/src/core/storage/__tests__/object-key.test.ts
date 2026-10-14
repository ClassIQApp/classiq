import { FileStorageError } from "../errors.ts";
import type { FileReference } from "../file-storage.ts";
import { fileObjectKey } from "../object-key.ts";
import { describe, expect, it } from "vitest";

describe("fileObjectKey", () => {
    it.each([
        [{ kind: "recording", courseId: "1", lectureId: "2", assetId: "recording-01" }, "courses/1/lectures/2/recordings/recording-01"],
        [{ kind: "resource", courseId: "1", assetId: "resource_01" }, "courses/1/resources/resource_01"],
        [{ kind: "resource", courseId: "1", lectureId: "2", assetId: "resource_01" }, "courses/1/lectures/2/resources/resource_01"],
    ] satisfies [FileReference, string][])("creates a deterministic key for %j", (reference, key) => {
        expect(fileObjectKey(reference)).toBe(key);
        expect(fileObjectKey({ ...reference })).toBe(key);
    });

    it("keeps course, lecture and file-kind scopes distinct", () => {
        const keys = [
            fileObjectKey({ kind: "resource", courseId: "1", assetId: "a" }),
            fileObjectKey({ kind: "resource", courseId: "2", assetId: "a" }),
            fileObjectKey({ kind: "resource", courseId: "1", lectureId: "2", assetId: "a" }),
            fileObjectKey({ kind: "recording", courseId: "1", lectureId: "2", assetId: "a" }),
            fileObjectKey({ kind: "recording", courseId: "1", lectureId: "3", assetId: "a" }),
        ];

        expect(new Set(keys).size).toBe(keys.length);
    });

    it.each(["", ".", "..", "../other", "foo/bar", String.raw`foo\bar`, "%2Fother", "a?b", "a#b", "a b", "é", "a\n", "a".repeat(129)])(
        "rejects unsafe IDs in every key segment: %j",
        (unsafeId) => {
            for (const field of ["courseId", "lectureId", "assetId"] as const) {
                expect(() => fileObjectKey({ kind: "recording", courseId: "1", lectureId: "2", assetId: "a", [field]: unsafeId })).toThrow(
                    FileStorageError,
                );
            }
            expect(() => fileObjectKey({ kind: "resource", courseId: "1", assetId: "a", lectureId: unsafeId })).toThrow(FileStorageError);
        },
    );

    it("accepts the identifier length boundary", () => {
        expect(fileObjectKey({ kind: "resource", courseId: "a".repeat(128), assetId: "a".repeat(128) })).toContain("/resources/");
    });
});
