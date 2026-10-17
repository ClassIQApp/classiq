import type { LlmProviderName } from "./model.ts";

export type LlmErrorCode =
    | "invalid_configuration"
    | "invalid_request"
    | "cancelled"
    | "timeout"
    | "provider_error"
    | "invalid_response"
    | "refused"
    | "incomplete";

const messages: Record<LlmErrorCode, string> = {
    invalid_configuration: "The LLM configuration is invalid.",
    invalid_request: "The LLM request is invalid.",
    cancelled: "The LLM request was cancelled.",
    timeout: "The LLM request timed out.",
    provider_error: "The LLM provider could not complete the request.",
    invalid_response: "The LLM provider returned an invalid response.",
    refused: "The LLM provider refused the request.",
    incomplete: "The LLM provider returned an incomplete response.",
};

interface LlmErrorDetails {
    provider?: LlmProviderName;
    status?: number;
    requestId?: string;
    retryable?: boolean;
}

/** Safe diagnostics only: never attach prompts, credentials, provider bodies, or causes. */
export class LlmError extends Error {
    readonly code: LlmErrorCode;
    readonly provider?: LlmProviderName;
    readonly status?: number;
    readonly requestId?: string;
    readonly retryable: boolean;

    constructor(code: LlmErrorCode, details: LlmErrorDetails = {}) {
        super(messages[code]);
        this.name = "LlmError";
        this.code = code;
        this.provider = details.provider;
        this.status = details.status;
        this.requestId = details.requestId;
        this.retryable = details.retryable ?? false;
    }
}
