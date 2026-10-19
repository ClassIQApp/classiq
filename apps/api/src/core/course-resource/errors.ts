export type CourseResourceErrorCode = "invalid_reference" | "invalid_resource" | "not_found" | "invalid_state" | "provider_error";

const messages: Record<CourseResourceErrorCode, string> = {
    invalid_reference: "The course resource reference is invalid.",
    invalid_resource: "The course resource metadata is invalid.",
    not_found: "The course or resource was not found.",
    invalid_state: "The course resource upload status cannot be changed.",
    provider_error: "The course resource provider could not complete the request.",
};

export class CourseResourceError extends Error {
    readonly code: CourseResourceErrorCode;

    constructor(code: CourseResourceErrorCode) {
        super(messages[code]);
        this.name = "CourseResourceError";
        this.code = code;
    }
}
