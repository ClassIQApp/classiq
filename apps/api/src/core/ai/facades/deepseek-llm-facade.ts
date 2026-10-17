import type { LlmProviderConfig } from "../config.ts";
import { AiSdkLlmFacade, type LlmFacadeOptions } from "./ai-sdk-llm-facade.ts";
import { createDeepSeek } from "@ai-sdk/deepseek";

export class DeepSeekLlmFacade extends AiSdkLlmFacade {
    constructor(config: LlmProviderConfig, options: LlmFacadeOptions = {}) {
        super(
            "deepseek",
            createDeepSeek({
                apiKey: config.apiKey,
                baseURL: "https://api.deepseek.com",
                fetch: options.fetch,
            })(config.model),
        );
    }
}
