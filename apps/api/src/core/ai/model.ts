import * as z from "zod/mini";

export const llmProviderSchema = z.enum(["openai", "deepseek"]);
export type LlmProviderName = z.infer<typeof llmProviderSchema>;

const nonemptyText = z.string().check(z.refine((value) => value.trim().length > 0));
export const llmMessageSchema = z.strictObject({
    role: z.enum(["system", "user", "assistant"]),
    content: nonemptyText,
});
export const llmRequestSchema = z.strictObject({
    messages: z.readonly(z.array(llmMessageSchema).check(z.minLength(1))),
    maxOutputTokens: z.optional(z.int().check(z.positive())),
});
export type LlmMessage = z.infer<typeof llmMessageSchema>;
export type LlmRequest = z.infer<typeof llmRequestSchema>;

export interface LlmCallOptions {
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
}

export interface LlmUsage {
    readonly inputTokens: number | undefined;
    readonly outputTokens: number | undefined;
    readonly totalTokens: number | undefined;
}

export type LlmCompletionStatus = "completed" | "incomplete" | "refused" | "failed";

export interface LlmCompletion {
    readonly status: LlmCompletionStatus;
    readonly text: string;
    readonly model: string;
    readonly responseId: string;
    readonly requestId?: string;
    readonly usage: LlmUsage;
}

export interface LlmResponse<T> extends Omit<LlmCompletion, "text" | "status"> {
    readonly provider: LlmProviderName;
    readonly data: T;
}
