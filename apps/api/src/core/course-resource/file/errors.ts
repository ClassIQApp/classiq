export type CourseResourceFileErrorCode =
    "invalid_reference" | "invalid_upload" | "invalid_configuration" | "not_found" | "access_denied" | "conflict" | "provider_error";

const messages: Record<CourseResourceFileErrorCode, string> = {
    invalid_reference: "The file reference is invalid.",
    invalid_upload: "The file upload is invalid.",
    invalid_configuration: "The course resource file configuration is invalid.",
    not_found: "File was not found.",
    access_denied: "Storage access was denied.",
    conflict: "File already exists or changed during upload.",
    provider_error: "The resource file provider could not complete the request.",
};

interface CourseResourceFileErrorDetails {
    status?: number;
    requestId?: string;
}

export class CourseResourceFileError extends Error {
    readonly code: CourseResourceFileErrorCode;
    readonly status?: number;
    readonly requestId?: string;

    constructor(code: CourseResourceFileErrorCode, details: CourseResourceFileErrorDetails = {}) {
        super(messages[code]);
        this.name = "CourseResourceFileError";
        this.code = code;
        this.status = details.status;
        this.requestId = details.requestId;
    }
}
