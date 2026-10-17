import { LlmError } from "./errors.ts";
import type { LlmRepository } from "./llm-repository.ts";
import { llmRequestSchema, type LlmCallOptions, type LlmRequest, type LlmResponse } from "./model.ts";
import pTimeout from "p-timeout";
import * as z from "zod/mini";

export const DEFAULT_LLM_TIMEOUT_MS = 30 * 1000;
export const llmTimeoutSchema = z.int().check(z.positive(), z.maximum(2 ** 31 - 1));

interface LlmServiceOptions {
    readonly timeoutMs?: number;
}

export class LlmService {
    private readonly timeoutMs: number;
    private readonly llmRepository: LlmRepository;

    constructor(llmRepository: LlmRepository, options: LlmServiceOptions = {}) {
        const timeout = llmTimeoutSchema.safeParse(options.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS);
        if (!timeout.success) {
            throw new LlmError("invalid_configuration");
        }

        this.timeoutMs = timeout.data;
        this.llmRepository = llmRepository;
    }

    generateText(request: LlmRequest, options: LlmCallOptions = {}): Promise<LlmResponse<string>> {
        return this.generate(request, (text) => text, options);
    }

    async generateStructured<T>(request: LlmRequest, schema: z.ZodMiniType<T>, options: LlmCallOptions = {}): Promise<LlmResponse<T>> {
        try {
            if (z.toJSONSchema(schema).type !== "object") {
                throw new Error("Structured output must be an object");
            }
        } catch {
            throw new LlmError("invalid_request");
        }

        return this.generate(request, (text) => schema.parseAsync(JSON.parse(text)), options, schema);
    }

    private async generate<T>(
        request: LlmRequest,
        parse: (text: string) => T | Promise<T>,
        options: LlmCallOptions,
        output?: z.ZodMiniType<T>,
    ): Promise<LlmResponse<T>> {
        const parsedRequest = llmRequestSchema.safeParse(request);
        const timeout = llmTimeoutSchema.safeParse(options.timeoutMs ?? this.timeoutMs);
        if (!parsedRequest.success || !timeout.success) {
            throw new LlmError("invalid_request");
        }

        return this.executeWithDeadline(options.signal, timeout.data, async (signal) => {
            const completion = await this.llmRepository.generate({ ...parsedRequest.data, output }, signal);
            if (completion.status !== "completed") {
                throw new LlmError(completion.status === "failed" ? "provider_error" : completion.status, {
                    provider: this.llmRepository.provider,
                    requestId: completion.requestId,
                });
            }
            if (!completion.text.trim()) {
                throw new LlmError("invalid_response", {
                    provider: this.llmRepository.provider,
                    requestId: completion.requestId,
                });
            }

            let data: T;
            try {
                data = await parse(completion.text);
            } catch {
                throw new LlmError("invalid_response", {
                    provider: this.llmRepository.provider,
                    requestId: completion.requestId,
                });
            }

            return {
                provider: this.llmRepository.provider,
                model: completion.model,
                responseId: completion.responseId,
                requestId: completion.requestId,
                usage: completion.usage,
                data,
            };
        });
    }

    private async executeWithDeadline<T>(
        signal: AbortSignal | undefined,
        timeoutMs: number,
        operation: (signal: AbortSignal) => Promise<T>,
    ): Promise<T> {
        const provider = this.llmRepository.provider;
        if (signal?.aborted) {
            throw new LlmError("cancelled", { provider });
        }

        const controller = new AbortController();
        const timeoutError = new LlmError("timeout", {
            provider,
            retryable: true,
        });

        try {
            return await pTimeout(
                Promise.resolve().then(() => operation(controller.signal)),
                {
                    milliseconds: timeoutMs,
                    signal,
                    message: timeoutError,
                },
            );
        } catch (error) {
            if (error === timeoutError) {
                controller.abort();
                throw error;
            } else if (signal?.aborted) {
                controller.abort();
                throw new LlmError("cancelled", { provider });
            } else if (error instanceof LlmError) {
                throw error;
            }

            throw new LlmError("provider_error", { provider });
        }
    }
}
