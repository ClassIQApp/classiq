import { readLlmConfig, type LlmEnvironment } from "./config.ts";
import { DeepSeekLlmFacade } from "./facades/deepseek-llm-facade.ts";
import { OpenAiLlmFacade } from "./facades/openai-llm-facade.ts";
import type { LlmRepository } from "./llm-repository.ts";
import { LlmService } from "./llm-service.ts";

export function createLlmService(environment: Readonly<LlmEnvironment> = process.env): LlmService {
    const config = readLlmConfig(environment);
    let repository: LlmRepository;

    switch (config.provider) {
        case "openai":
            repository = new OpenAiLlmFacade(config);
            break;

        case "deepseek":
            repository = new DeepSeekLlmFacade(config);
            break;
    }

    return new LlmService(repository, { timeoutMs: config.timeoutMs });
}
