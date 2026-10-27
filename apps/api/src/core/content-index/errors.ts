export type ContentIndexErrorCode = "invalid_reference" | "invalid_content" | "empty_content" | "invalid_query" | "not_found";

const messages: Record<ContentIndexErrorCode, string> = {
    invalid_reference: "The content source reference is invalid.",
    invalid_content: "The content to index is invalid.",
    empty_content: "The content source has no indexable text.",
    invalid_query: "The content search query is invalid.",
    not_found: "The course, lecture, or resource was not found.",
};

export class ContentIndexError extends Error {
    readonly code: ContentIndexErrorCode;

    constructor(code: ContentIndexErrorCode) {
        super(messages[code]);
        this.name = "ContentIndexError";
        this.code = code;
    }
}
