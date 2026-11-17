export type BookmarkErrorCode = "invalid_request" | "not_found";

const messages: Record<BookmarkErrorCode, string> = {
    invalid_request: "The bookmark is invalid.",
    not_found: "The course, lecture, or bookmark was not found.",
};

export class BookmarkError extends Error {
    readonly code: BookmarkErrorCode;

    constructor(code: BookmarkErrorCode) {
        super(messages[code]);
        this.name = "BookmarkError";
        this.code = code;
    }
}
