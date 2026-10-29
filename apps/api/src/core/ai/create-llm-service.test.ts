import { createLlmService } from "./create-llm-service.ts";
import { LlmError } from "./errors.ts";
import { describe, expect, it } from "vitest";

describe("createLlmService", () => {
    it.each([
        { LLM_PROVIDER: "openai", OPENAI_API_KEY: "sk-test", OPENAI_MODEL: "gpt-test" },
        { LLM_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "ds-test", DEEPSEEK_MODEL: "deepseek-chat", LLM_TIMEOUT_MS: "5000" },
    ])("builds a service for $LLM_PROVIDER", (environment) => {
        expect(createLlmService(environment)).toBeDefined();
    });

    it("rejects missing credentials", () => {
        expect(() => createLlmService({ LLM_PROVIDER: "openai" })).toThrow(LlmError);
    });
});
