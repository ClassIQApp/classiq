export type ChatErrorCode = "invalid_request" | "not_found" | "forbidden";

const messages: Record<ChatErrorCode, string> = {
    invalid_request: "The message is invalid.",
    not_found: "The course, lecture, or message was not found.",
    forbidden: "You can only delete your own messages.",
};

export class ChatError extends Error {
    readonly code: ChatErrorCode;

    constructor(code: ChatErrorCode) {
        super(messages[code]);
        this.name = "ChatError";
        this.code = code;
    }
}
