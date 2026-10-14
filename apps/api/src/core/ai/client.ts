import { LlmError } from "./errors.ts";
import type {
    LlmCallOptions,
    LlmClient,
    LlmProvider,
    LlmProviderRequest,
    LlmProviderResponse,
    LlmRequest,
    LlmResponse,
    StructuredOutput,
} from "./model.ts";

export const DEFAULT_LLM_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 2_147_483_647;

export function isValidTimeout(timeoutMs: number): boolean {
    return Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= MAX_TIMEOUT_MS;
}

function validateRequest(request: LlmRequest): void {
    if (
        !Array.isArray(request.messages) ||
        request.messages.length === 0 ||
        request.messages.some(
            (message) =>
                !message ||
                !["system", "user", "assistant"].includes(message.role) ||
                typeof message.content !== "string" ||
                message.content.trim().length === 0,
        ) ||
        (request.maxOutputTokens !== undefined && (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens < 1))
    ) {
        throw new LlmError("invalid_request");
    }
}

function validateOutput<T>(output: StructuredOutput<T>): void {
    if (
        !/^[\w-]{1,64}$/.test(output.name) ||
        !output.jsonSchema ||
        output.jsonSchema.type !== "object" ||
        typeof output.parse !== "function"
    ) {
        throw new LlmError("invalid_request");
    }

    try {
        JSON.stringify(output.jsonSchema);
    } catch {
        throw new LlmError("invalid_request");
    }
}

async function withDeadline<T>(
    provider: string,
    options: LlmCallOptions,
    timeoutMs: number,
    operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
    if (options.signal?.aborted) {
        throw new LlmError("cancelled", { provider });
    }

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: (() => void) | undefined;
    const interrupted = new Promise<never>((_resolve, reject) => {
        cancel = () => {
            reject(new LlmError("cancelled", { provider }));
            controller.abort();
        };
        options.signal?.addEventListener("abort", cancel, { once: true });
        timer = setTimeout(() => {
            reject(new LlmError("timeout", { provider, retryable: true }));
            controller.abort();
        }, timeoutMs);
    });

    try {
        // Race as well as abort so an uncooperative transport cannot keep callers waiting.
        return await Promise.race([interrupted, Promise.resolve().then(() => operation(controller.signal))]);
    } finally {
        clearTimeout(timer);
        if (cancel) {
            options.signal?.removeEventListener("abort", cancel);
        }
    }
}

export function createLlmClient(provider: LlmProvider, config: { readonly timeoutMs?: number } = {}): LlmClient {
    const defaultTimeoutMs = config.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS;
    if (!isValidTimeout(defaultTimeoutMs)) {
        throw new LlmError("invalid_configuration");
    }

    async function generate<T>(
        request: LlmRequest,
        parse: (text: string) => T,
        options: LlmCallOptions,
        output?: LlmProviderRequest["output"],
    ): Promise<LlmResponse<T>> {
        validateRequest(request);
        const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
        if (!isValidTimeout(timeoutMs)) {
            throw new LlmError("invalid_request");
        }

        return withDeadline(provider.name, options, timeoutMs, async (signal) => {
            let response: LlmProviderResponse;
            try {
                response = await provider.generate(
                    {
                        messages: request.messages.map(({ role, content }) => ({ role, content })),
                        maxOutputTokens: request.maxOutputTokens,
                        output,
                    },
                    signal,
                );
            } catch (error) {
                if (error instanceof LlmError) {
                    throw error;
                }
                throw new LlmError("provider_error", { provider: provider.name, retryable: true });
            }

            if (typeof response.text !== "string" || response.text.trim().length === 0) {
                throw new LlmError("invalid_response", { provider: provider.name, requestId: response.requestId });
            }
            try {
                return {
                    provider: provider.name,
                    model: response.model,
                    responseId: response.responseId,
                    requestId: response.requestId,
                    usage: response.usage,
                    data: parse(response.text),
                };
            } catch {
                throw new LlmError("invalid_response", { provider: provider.name, requestId: response.requestId });
            }
        });
    }

    return {
        generateText: (request, options = {}) => generate(request, (text) => text, options),
        generateStructured: <T>(request: LlmRequest, output: StructuredOutput<T>, options: LlmCallOptions = {}) => {
            // Return rejected promises consistently, including invalid schema definitions.
            return Promise.resolve().then(() => {
                validateOutput(output);

                return generate(request, (text) => output.parse(JSON.parse(text)), options, {
                    name: output.name,
                    jsonSchema: output.jsonSchema,
                });
            });
        },
    };
}
