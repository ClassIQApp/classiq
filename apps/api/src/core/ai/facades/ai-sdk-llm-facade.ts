import { LlmError, type LlmErrorCode } from "../errors.ts";
import type { LlmRepository, LlmRepositoryRequest } from "../llm-repository.ts";
import type { LlmCompletion, LlmCompletionStatus, LlmProviderName } from "../model.ts";
import {
    APICallError,
    generateText,
    InvalidResponseDataError,
    jsonSchema,
    NoObjectGeneratedError,
    Output,
    zodSchema,
    type FinishReason,
    type LanguageModel,
} from "ai";

const completionStatusByFinishReason: Record<FinishReason, LlmCompletionStatus> = {
    stop: "completed",
    length: "incomplete",
    "content-filter": "refused",
    "tool-calls": "failed",
    error: "failed",
    other: "failed",
} as const;

export interface LlmFacadeOptions {
    readonly fetch?: typeof globalThis.fetch;
}

export abstract class AiSdkLlmFacade implements LlmRepository {
    public readonly provider: LlmProviderName;

    private readonly model: Exclude<LanguageModel, string>;
    private readonly providerOptions?: Parameters<typeof generateText>[0]["providerOptions"];

    constructor(provider: typeof this.provider, model: typeof this.model, providerOptions?: typeof this.providerOptions) {
        this.model = model;
        this.provider = provider;
        this.providerOptions = providerOptions;
    }

    async generate<T>(request: LlmRepositoryRequest<T>, signal: AbortSignal): Promise<LlmCompletion> {
        try {
            const result = await generateText({
                model: this.model,
                messages: [...request.messages],
                maxOutputTokens: request.maxOutputTokens,
                abortSignal: signal,
                maxRetries: 0,
                providerOptions: this.providerOptions,
                telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
                include: { requestBody: false, responseBody: false },
                output: request.output
                    ? Output.object({
                          schema: jsonSchema(zodSchema(request.output).jsonSchema),
                      })
                    : Output.text(),
            });

            const step = result.finalStep;

            return {
                status: completionStatusByFinishReason[step.finishReason],
                text: step.text,
                model: step.response.modelId,
                responseId: step.response.id,
                requestId: step.response.headers?.["x-request-id"],
                usage: {
                    inputTokens: step.usage.inputTokens,
                    outputTokens: step.usage.outputTokens,
                    totalTokens: step.usage.totalTokens,
                },
            };
        } catch (error) {
            throw this.convertError(error);
        }
    }

    private convertError(error: unknown): LlmError {
        if (APICallError.isInstance(error)) {
            return new LlmError(error.statusCode !== undefined && error.statusCode < 400 ? "invalid_response" : "provider_error", {
                provider: this.provider,
                status: error.statusCode,
                requestId: error.responseHeaders?.["x-request-id"],
                retryable: error.isRetryable,
            });
        }
        if (NoObjectGeneratedError.isInstance(error)) {
            let code: LlmErrorCode = "invalid_response";
            if (error.finishReason === "length") {
                code = "incomplete";
            } else if (error.finishReason === "content-filter") {
                code = "refused";
            }

            return new LlmError(code, {
                provider: this.provider,
                requestId: error.response?.headers?.["x-request-id"],
            });
        }

        return new LlmError(InvalidResponseDataError.isInstance(error) ? "invalid_response" : "provider_error", {
            provider: this.provider,
        });
    }
}
