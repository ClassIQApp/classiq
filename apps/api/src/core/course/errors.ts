export type CourseErrorCode = "invalid_reference" | "invalid_course" | "not_found" | "conflict" | "provider_error";

const messages: Record<CourseErrorCode, string> = {
    invalid_reference: "The course reference is invalid.",
    invalid_course: "The course metadata is invalid.",
    not_found: "The course was not found.",
    conflict: "The course code or slug is already in use.",
    provider_error: "The course provider could not complete the request.",
};

export class CourseError extends Error {
    readonly code: CourseErrorCode;

    constructor(code: CourseErrorCode) {
        super(messages[code]);
        this.name = "CourseError";
        this.code = code;
    }
}
