import type { LlmProviderConfig } from "../config.ts";
import { AiSdkLlmFacade, type LlmFacadeOptions } from "./ai-sdk-llm-facade.ts";
import { createOpenAI, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";

export class OpenAiLlmFacade extends AiSdkLlmFacade {
    constructor(config: LlmProviderConfig, options: LlmFacadeOptions = {}) {
        const openAiOptions: OpenAILanguageModelResponsesOptions = {
            store: false,
        };

        super(
            "openai",
            createOpenAI({
                apiKey: config.apiKey,
                baseURL: "https://api.openai.com/v1",
                fetch: options.fetch,
            }).responses(config.model),
            { openai: openAiOptions },
        );
    }
}
