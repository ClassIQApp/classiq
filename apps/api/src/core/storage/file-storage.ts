import type { Readable } from "node:stream";

export type FileReference =
    | { readonly kind: "recording"; readonly courseId: string; readonly lectureId: string; readonly assetId: string }
    | { readonly kind: "resource"; readonly courseId: string; readonly lectureId?: string; readonly assetId: string };

export interface FileUpload {
    readonly body: Uint8Array | Readable;
    readonly contentType: string;
    readonly contentLength: number;
}

export interface StoredFile {
    readonly key: string;
    readonly contentType: string;
    readonly contentLength: number | undefined;
    readonly etag: string | undefined;
}

export interface DownloadedFile extends StoredFile {
    readonly body: Readable;
}

/** Server-side storage. Callers must authorize access to the referenced course/lecture. */
export interface FileStorage {
    /** Create a file; an existing current object at this reference produces a conflict. */
    put(reference: FileReference, upload: FileUpload): Promise<StoredFile>;
    /** The caller must consume or destroy the returned stream. */
    get(reference: FileReference): Promise<DownloadedFile>;
    /** Idempotently hide the current object. Historical versions are retained by S3. */
    delete(reference: FileReference): Promise<void>;
}
