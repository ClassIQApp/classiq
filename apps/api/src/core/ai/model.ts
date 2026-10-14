export interface LlmMessage {
    readonly role: "system" | "user" | "assistant";
    readonly content: string;
}

export interface LlmRequest {
    readonly messages: readonly LlmMessage[];
    readonly maxOutputTokens?: number;
}

export interface LlmCallOptions {
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
}

export interface StructuredOutput<T> {
    readonly name: string;
    readonly jsonSchema: Readonly<Record<string, unknown>>;
    /** Validate the parsed JSON and throw if it is unsuitable for the feature. */
    readonly parse: (value: unknown) => T;
}

export interface LlmUsage {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
}

export interface LlmProviderResponse {
    readonly text: string;
    readonly model: string;
    readonly responseId: string;
    readonly requestId?: string;
    readonly usage?: LlmUsage;
}

export interface LlmResponse<T> extends Omit<LlmProviderResponse, "text"> {
    readonly provider: string;
    readonly data: T;
}

export interface LlmProviderRequest extends LlmRequest {
    readonly output?: Pick<StructuredOutput<never>, "name" | "jsonSchema">;
}

/** Providers perform one attempt and must pass the supplied signal to their transport. */
export interface LlmProvider {
    readonly name: string;
    generate(request: LlmProviderRequest, signal: AbortSignal): Promise<LlmProviderResponse>;
}

export interface LlmClient {
    generateText(request: LlmRequest, options?: LlmCallOptions): Promise<LlmResponse<string>>;
    generateStructured<T>(request: LlmRequest, output: StructuredOutput<T>, options?: LlmCallOptions): Promise<LlmResponse<T>>;
}
