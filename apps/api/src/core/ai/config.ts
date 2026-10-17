import { LlmError } from "./errors.ts";
import { DEFAULT_LLM_TIMEOUT_MS, llmTimeoutSchema } from "./llm-service.ts";
import { llmProviderSchema, type LlmProviderName } from "./model.ts";
import * as z from "zod/mini";

export const LlmProviderConfigSchema = z.strictObject({
    apiKey: z.string().check(z.regex(/^\S+$/)),
    model: z.string().check(z.trim(), z.minLength(1)),
});
export type LlmProviderConfig = z.infer<typeof LlmProviderConfigSchema>;

export const LlmConfigSchema = z.extend(LlmProviderConfigSchema, {
    provider: llmProviderSchema,
    timeoutMs: z._default(llmTimeoutSchema, DEFAULT_LLM_TIMEOUT_MS),
});
export type LlmConfig = z.infer<typeof LlmConfigSchema>;

export interface LlmEnvironment {
    LLM_PROVIDER?: string;
    LLM_TIMEOUT_MS?: string;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    DEEPSEEK_API_KEY?: string;
    DEEPSEEK_MODEL?: string;
}

export function readLlmConfig(environment: Readonly<LlmEnvironment>): LlmConfig {
    const provider = llmProviderSchema.safeParse(environment.LLM_PROVIDER ?? "openai");
    if (!provider.success) {
        throw new LlmError("invalid_configuration");
    }

    const config = LlmConfigSchema.safeParse({
        provider: provider.data,
        ...readProviderCredentials(provider.data, environment),
        timeoutMs: environment.LLM_TIMEOUT_MS === undefined ? undefined : Number(environment.LLM_TIMEOUT_MS),
    });

    if (!config.success) {
        throw new LlmError("invalid_configuration", {
            provider: provider.data,
        });
    }

    return config.data;
}

interface ProviderCredentials {
    apiKey?: string;
    model?: string;
}

function readProviderCredentials(provider: LlmProviderName, environment: Readonly<LlmEnvironment>): ProviderCredentials {
    switch (provider) {
        case "openai":
            return {
                apiKey: environment.OPENAI_API_KEY,
                model: environment.OPENAI_MODEL,
            };

        case "deepseek":
            return {
                apiKey: environment.DEEPSEEK_API_KEY,
                model: environment.DEEPSEEK_MODEL,
            };
    }
}
