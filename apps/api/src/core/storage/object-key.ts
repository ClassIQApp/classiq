import { FileStorageError } from "./errors.ts";
import type { FileReference } from "./file-storage.ts";

const identifierPattern = /^[a-z\d][a-z\d_-]{0,127}$/i;

/** Stable keys use application IDs, never user-supplied filenames or arbitrary paths. */
export function fileObjectKey(reference: FileReference): string {
    if (!reference || (reference.kind !== "recording" && reference.kind !== "resource")) {
        throw new FileStorageError("invalid_reference", "File kind must be recording or resource");
    }

    validateIdentifier("courseId", reference.courseId);
    validateIdentifier("assetId", reference.assetId);

    const coursePrefix = `courses/${reference.courseId}`;
    if (reference.kind === "recording" || reference.lectureId !== undefined) {
        validateIdentifier("lectureId", reference.lectureId);

        return `${coursePrefix}/lectures/${reference.lectureId}/${reference.kind === "recording" ? "recordings" : "resources"}/${reference.assetId}`;
    }

    return `${coursePrefix}/resources/${reference.assetId}`;
}

function validateIdentifier(name: string, value: string | undefined): void {
    if (typeof value !== "string" || !identifierPattern.test(value)) {
        throw new FileStorageError(
            "invalid_reference",
            `${name} must be 1–128 ASCII letters, digits, underscores or hyphens, starting with a letter or digit`,
        );
    }
}
