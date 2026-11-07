import { LlmError } from "../ai/errors.ts";
import type { LlmRepository, LlmRepositoryRequest } from "../ai/llm-repository.ts";
import type { LlmCompletion } from "../ai/model.ts";
import type { ContentKind } from "./model.ts";
import { z } from "zod";

export interface GenerationFixture {
    outcome?: "completed" | "malformed" | "refused" | "transient";
    delayMs?: number;
    text?: string;
}
const inputSchema = z.object({
    kind: z.enum(["summary", "key_terms"]),
    segments: z.array(z.object({ text: z.string(), startSeconds: z.number(), endSeconds: z.number() })).min(1),
});
export class FixtureLlmFacade implements LlmRepository {
    readonly provider = "fixture";
    readonly calls = { summary: 0, key_terms: 0 };
    private readonly fixtures: Partial<Record<ContentKind, GenerationFixture>>;
    constructor(fixtures: Partial<Record<ContentKind, GenerationFixture>> = {}) {
        this.fixtures = fixtures;
    }
    async generate<T>(request: LlmRepositoryRequest<T>, signal: AbortSignal): Promise<LlmCompletion> {
        const input = inputSchema.parse(JSON.parse(request.messages.at(-1)!.content));
        this.calls[input.kind]++;
        const fixture = this.fixtures[input.kind] ?? {};
        if (fixture.delayMs)
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => {
                    signal.removeEventListener("abort", abort);
                    resolve();
                }, fixture.delayMs);
                const abort = () => {
                    clearTimeout(timer);
                    reject(new LlmError("cancelled"));
                };
                signal.addEventListener("abort", abort, { once: true });
                if (signal.aborted) abort();
            });
        if (fixture.outcome === "transient") throw new LlmError("provider_error", { retryable: true });
        const first = input.segments[0]!;
        const content =
            input.kind === "summary"
                ? { text: `Fixture summary: ${input.segments.map((segment) => segment.text).join(" ")}` }
                : {
                      terms: input.segments.slice(0, 8).map((segment) => ({
                          term: segment.text.split(" ").slice(0, 5).join(" "),
                          explanation: `The speaker introduces: ${segment.text}`,
                          sources: [{ startSeconds: segment.startSeconds, endSeconds: segment.endSeconds }],
                      })),
                  };

        return {
            status: fixture.outcome === "refused" ? "refused" : "completed",
            text: fixture.text ?? (fixture.outcome === "malformed" ? '{"terms":"invalid"}' : JSON.stringify(content)),
            model: "lecture-fixture-v1",
            responseId: `fixture-${input.kind}-${first.startSeconds}`,
            usage: { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined },
        };
    }
}
