export type FileStorageErrorCode =
    "invalid_reference" | "invalid_upload" | "invalid_configuration" | "not_found" | "access_denied" | "conflict" | "provider_error";

export class FileStorageError extends Error {
    constructor(
        public readonly code: FileStorageErrorCode,
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = "FileStorageError";
    }
}
