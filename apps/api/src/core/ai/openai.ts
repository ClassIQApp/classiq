import { DEFAULT_LLM_TIMEOUT_MS, isValidTimeout } from "./client.ts";
import { LlmError } from "./errors.ts";
import type { LlmProvider, LlmProviderResponse, LlmUsage } from "./model.ts";
import { validateHeaderValue } from "node:http";

export interface OpenAiConfig {
    readonly apiKey: string;
    readonly model: string;
    readonly timeoutMs?: number;
}

/** Call from a server composition root; no global environment access or eager initialization. */
export function readOpenAiConfig(environment: Readonly<Record<string, string | undefined>>): OpenAiConfig {
    const timeout = environment.LLM_TIMEOUT_MS;
    const config = {
        apiKey: environment.OPENAI_API_KEY ?? "",
        model: environment.OPENAI_MODEL ?? "",
        timeoutMs: timeout === undefined ? DEFAULT_LLM_TIMEOUT_MS : Number(timeout),
    };
    validateConfig(config);

    return config;
}

function validateConfig(config: OpenAiConfig): void {
    if (
        typeof config.apiKey !== "string" ||
        config.apiKey.trim().length === 0 ||
        typeof config.model !== "string" ||
        config.model.trim().length === 0 ||
        (config.timeoutMs !== undefined && !isValidTimeout(config.timeoutMs))
    ) {
        throw new LlmError("invalid_configuration", { provider: "openai" });
    }
    try {
        validateHeaderValue("Authorization", `Bearer ${config.apiKey}`);
    } catch {
        throw new LlmError("invalid_configuration", { provider: "openai" });
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTokenCount(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseUsage(value: unknown): LlmUsage | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (!isRecord(value) || !isTokenCount(value.input_tokens) || !isTokenCount(value.output_tokens) || !isTokenCount(value.total_tokens)) {
        throw new LlmError("invalid_response", { provider: "openai" });
    }

    return { inputTokens: value.input_tokens, outputTokens: value.output_tokens, totalTokens: value.total_tokens };
}

function parseResponse(value: unknown, requestId?: string): LlmProviderResponse {
    const diagnostics = { provider: "openai", requestId };
    if (!isRecord(value)) {
        throw new LlmError("invalid_response", diagnostics);
    }
    if (value.status === "incomplete") {
        throw new LlmError("incomplete", diagnostics);
    }
    if (value.status === "failed") {
        throw new LlmError("provider_error", diagnostics);
    }
    if (
        value.status !== "completed" ||
        typeof value.id !== "string" ||
        !value.id ||
        typeof value.model !== "string" ||
        !value.model ||
        !Array.isArray(value.output)
    ) {
        throw new LlmError("invalid_response", diagnostics);
    }

    const text: string[] = [];
    for (const item of value.output) {
        if (!isRecord(item) || typeof item.type !== "string") {
            throw new LlmError("invalid_response", diagnostics);
        }
        // Reasoning items are not user-facing output and must never be returned as generated text.
        if (item.type !== "message") {
            continue;
        }
        if (item.status !== "completed" || item.role !== "assistant" || !Array.isArray(item.content)) {
            throw new LlmError("invalid_response", diagnostics);
        }
        for (const content of item.content) {
            if (!isRecord(content)) {
                throw new LlmError("invalid_response", diagnostics);
            }
            if (content.type === "refusal") {
                throw new LlmError("refused", diagnostics);
            }
            if (content.type !== "output_text" || typeof content.text !== "string") {
                throw new LlmError("invalid_response", diagnostics);
            }
            text.push(content.text);
        }
    }
    if (text.join("").trim().length === 0) {
        throw new LlmError("invalid_response", diagnostics);
    }

    return { text: text.join(""), model: value.model, responseId: value.id, requestId, usage: parseUsage(value.usage) };
}

/** Server-only adapter. Keep this module and its configuration out of browser bundles. */
export function createOpenAiProvider(config: OpenAiConfig, transport: typeof fetch = globalThis.fetch): LlmProvider {
    validateConfig(config);
    // Capture configuration so mutations to the caller's object cannot change active requests.
    const { apiKey, model } = config;

    return {
        name: "openai",
        async generate(request, signal) {
            const response = await transport("https://api.openai.com/v1/responses", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                signal,
                body: JSON.stringify({
                    model,
                    input: request.messages,
                    max_output_tokens: request.maxOutputTokens,
                    store: false,
                    stream: false,
                    ...(request.output
                        ? {
                              text: {
                                  format: {
                                      type: "json_schema",
                                      name: request.output.name,
                                      schema: request.output.jsonSchema,
                                      strict: true,
                                  },
                              },
                          }
                        : {}),
                }),
            });
            const requestId = response.headers.get("x-request-id") ?? undefined;
            if (!response.ok) {
                // Do not read or retain error bodies: providers may echo secrets or prompt content.
                void response.body?.cancel().catch(() => undefined);
                throw new LlmError("provider_error", {
                    provider: "openai",
                    status: response.status,
                    requestId,
                    retryable: [408, 409, 429].includes(response.status) || response.status >= 500,
                });
            }
            let body: unknown;
            try {
                body = await response.json();
            } catch {
                throw new LlmError("invalid_response", { provider: "openai", requestId });
            }

            return parseResponse(body, requestId);
        },
    };
}
