export type CourseAccessErrorCode = "not_found" | "forbidden" | "provider_error";

const messages: Record<CourseAccessErrorCode, string> = {
    not_found: "The course was not found.",
    forbidden: "Only the course Teacher can do this.",
    provider_error: "The course membership provider could not complete the request.",
};

export class CourseAccessError extends Error {
    readonly code: CourseAccessErrorCode;

    constructor(code: CourseAccessErrorCode) {
        super(messages[code]);
        this.name = "CourseAccessError";
        this.code = code;
    }
}
