export type QaErrorCode = "invalid_request";

const messages: Record<QaErrorCode, string> = {
    invalid_request: "The question is invalid.",
};

export class QaError extends Error {
    readonly code: QaErrorCode;

    constructor(code: QaErrorCode) {
        super(messages[code]);
        this.name = "QaError";
        this.code = code;
    }
}
