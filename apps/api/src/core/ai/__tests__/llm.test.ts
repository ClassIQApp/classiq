import { createLlmClient, createOpenAiProvider, DEFAULT_LLM_TIMEOUT_MS, LlmError, readOpenAiConfig } from "../index.ts";
import type { LlmProvider, StructuredOutput } from "../index.ts";
import { ReadableStream } from "node:stream/web";
import { afterEach, describe, expect, it, vi } from "vitest";

const config = { apiKey: "test-secret", model: "configured-model" };
const request = { messages: [{ role: "user", content: "Summarize this lesson." }] } as const;
const summaryOutput: StructuredOutput<{ summary: string }> = {
    name: "lesson_summary",
    jsonSchema: {
        type: "object",
        properties: { summary: { type: "string" } },
        required: ["summary"],
        additionalProperties: false,
    },
    parse(value) {
        if (
            typeof value !== "object" ||
            value === null ||
            !("summary" in value) ||
            typeof value.summary !== "string" ||
            value.summary.trim().length === 0
        ) {
            throw new Error("Sensitive validation details must not escape.");
        }

        return { summary: value.summary };
    },
};

function envelope(text = "A short summary.") {
    return {
        id: "resp_test",
        model: "resolved-model",
        status: "completed",
        output: [{ type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text }] }],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    };
}

function jsonResponse(body: unknown, status = 200) {
    return Response.json(body, { status, headers: { "x-request-id": "req_test" } });
}

function harness(response = jsonResponse(envelope())) {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    const client = createLlmClient(createOpenAiProvider(config, transport));

    return { client, transport };
}

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("shared LLM integration", () => {
    it("generates text with explicit server configuration and safe metadata", async () => {
        const { client, transport } = harness();
        const result = await client.generateText({ ...request, maxOutputTokens: 120 });

        expect(result).toEqual({
            provider: "openai",
            model: "resolved-model",
            responseId: "resp_test",
            requestId: "req_test",
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            data: "A short summary.",
        });
        expect(transport).toHaveBeenCalledOnce();
        const [url, init] = transport.mock.calls[0]!;
        expect(url).toBe("https://api.openai.com/v1/responses");
        expect(init?.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer test-secret" });
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        expect(JSON.parse(String(init?.body))).toEqual({
            model: "configured-model",
            input: request.messages,
            max_output_tokens: 120,
            store: false,
            stream: false,
        });
        expect(JSON.stringify(result)).not.toContain(config.apiKey);
    });

    it("requests strict structured output and runs feature validation", async () => {
        const { client, transport } = harness(jsonResponse(envelope('{"summary":"Validated lesson summary."}')));
        const result = await client.generateStructured(request, summaryOutput);
        expect(result.data.summary).toBe("Validated lesson summary.");
        const body = JSON.parse(String(transport.mock.calls[0]?.[1]?.body));
        expect(body.text.format).toEqual({
            type: "json_schema",
            name: summaryOutput.name,
            schema: summaryOutput.jsonSchema,
            strict: true,
        });
        expect(body).not.toHaveProperty("apiKey");
    });

    it("ignores reasoning items and combines output text in order", async () => {
        const body = envelope();
        const { client } = harness(
            jsonResponse({
                ...body,
                output: [
                    { type: "reasoning", summary: [{ type: "summary_text", text: "Private reasoning." }] },
                    {
                        ...body.output[0],
                        content: [
                            { type: "output_text", text: "First " },
                            { type: "output_text", text: "second." },
                        ],
                    },
                ],
            }),
        );
        const result = await client.generateText(request);
        expect(result.data).toBe("First second.");
    });

    it.each(["not JSON", '{"summary":42}', '{"summary":""}'])("rejects invalid structured data: %s", async (text) => {
        const { client } = harness(jsonResponse(envelope(text)));
        await expect(client.generateStructured(request, summaryOutput)).rejects.toMatchObject({
            code: "invalid_response",
            provider: "openai",
            requestId: "req_test",
            retryable: false,
        });
    });

    it.each([
        null,
        { ...envelope(), id: 12 },
        { ...envelope(), model: null },
        { ...envelope(), output: null },
        { ...envelope(), output: [] },
        { ...envelope(), output: [{ type: "message", content: "wrong shape" }] },
        { ...envelope(), output: [{ ...envelope().output[0], status: "incomplete" }] },
        { ...envelope(), usage: { input_tokens: -1, output_tokens: 5, total_tokens: 4 } },
        envelope(" "),
    ])("rejects malformed provider envelopes", async (body) => {
        const { client } = harness(jsonResponse(body));
        await expect(client.generateText(request)).rejects.toMatchObject({ code: "invalid_response" });
    });

    it("rejects a non-JSON provider body", async () => {
        const { client } = harness(new Response("<html>unavailable</html>"));
        await expect(client.generateText(request)).rejects.toMatchObject({ code: "invalid_response" });
    });

    it.each(["incomplete", "failed", "in_progress"])("rejects %s responses before parsing", async (status) => {
        const { client } = harness(jsonResponse({ ...envelope('{"summary":"looks valid"}'), status }));
        const parse = vi.fn(summaryOutput.parse);
        await expect(client.generateStructured(request, { ...summaryOutput, parse })).rejects.toMatchObject({
            code: status === "failed" ? "provider_error" : status === "incomplete" ? "incomplete" : "invalid_response",
        });
        expect(parse).not.toHaveBeenCalled();
    });

    it("rejects refusals without exposing the provider's refusal text", async () => {
        const { client } = harness(
            jsonResponse({
                ...envelope(),
                output: [{ ...envelope().output[0], content: [{ type: "refusal", refusal: "Sensitive content." }] }],
            }),
        );
        await expect(client.generateStructured(request, summaryOutput)).rejects.toMatchObject({ code: "refused" });
    });

    it.each([
        [400, false],
        [401, false],
        [408, true],
        [409, true],
        [429, true],
        [503, true],
    ])("normalizes HTTP %s without retrying or retaining its body", async (status, retryable) => {
        const { client, transport } = harness(jsonResponse({ error: { message: "test-secret and private prompt" } }, status));
        let failure: unknown;
        try {
            await client.generateText(request);
        } catch (error) {
            failure = error;
        }
        expect(failure).toBeInstanceOf(LlmError);
        expect(failure).toMatchObject({ code: "provider_error", provider: "openai", status, requestId: "req_test", retryable });
        expect(String(failure)).not.toContain("test-secret");
        expect(JSON.stringify(failure)).not.toContain("private prompt");
        expect(failure).not.toHaveProperty("cause");
        expect(transport).toHaveBeenCalledOnce();
    });

    it("normalizes network failures without retaining transport errors", async () => {
        const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error("test-secret"));
        const client = createLlmClient(createOpenAiProvider(config, transport));
        await expect(client.generateText(request)).rejects.toMatchObject({
            code: "provider_error",
            retryable: true,
            message: "The LLM provider could not complete the request.",
        });
    });

    it("bounds an uncooperative transport and aborts it at the configured deadline", async () => {
        vi.useFakeTimers();
        const transport = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
        const client = createLlmClient(createOpenAiProvider(config, transport), { timeoutMs: 50 });
        const promise = client.generateText(request);
        const assertion = expect(promise).rejects.toMatchObject({ code: "timeout", retryable: true });
        await vi.advanceTimersByTimeAsync(50);
        await assertion;
        expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("includes stalled response-body reads in the deadline", async () => {
        vi.useFakeTimers();
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('{"status":"completed",'));
            },
        });
        const { client, transport } = harness(new Response(stream));
        const promise = client.generateText(request, { timeoutMs: 25 });
        const assertion = expect(promise).rejects.toMatchObject({ code: "timeout" });
        await vi.advanceTimersByTimeAsync(25);
        await assertion;
        expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    });

    it("keeps caller cancellation distinct from timeout and drops signal reasons", async () => {
        const transport = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
        const client = createLlmClient(createOpenAiProvider(config, transport));
        const controller = new AbortController();
        const promise = client.generateText(request, { signal: controller.signal });
        const assertion = expect(promise).rejects.toMatchObject({ code: "cancelled", retryable: false });
        controller.abort("test-secret");
        await assertion;
        expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    });

    it("never calls a provider for a request that was already cancelled", async () => {
        const { client, transport } = harness();
        await expect(client.generateText(request, { signal: AbortSignal.abort() })).rejects.toMatchObject({ code: "cancelled" });
        expect(transport).not.toHaveBeenCalled();
    });

    it("removes caller listeners and timers after success", async () => {
        vi.useFakeTimers();
        const { client } = harness();
        const controller = new AbortController();
        const remove = vi.spyOn(controller.signal, "removeEventListener");
        await client.generateText(request, { signal: controller.signal });
        expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
        expect(vi.getTimerCount()).toBe(0);
    });

    it("accepts another provider through the same text and structured path", async () => {
        const provider: LlmProvider = {
            name: "alternative",
            async generate(_request, signal) {
                expect(signal).toBeInstanceOf(AbortSignal);

                return { text: '{"summary":"Alternative provider."}', model: "other-model", responseId: "other-response" };
            },
        };
        const client = createLlmClient(provider);
        const result = await client.generateStructured(request, summaryOutput);
        expect(result.provider).toBe("alternative");
        expect(result.data).toEqual({ summary: "Alternative provider." });
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
        "rejects invalid timeouts before making requests: %s",
        async (timeoutMs) => {
            const { client, transport } = harness();
            expect(() => createLlmClient(createOpenAiProvider(config, transport), { timeoutMs })).toThrow(LlmError);
            await expect(client.generateText(request, { timeoutMs })).rejects.toMatchObject({ code: "invalid_request" });
            expect(transport).not.toHaveBeenCalled();
        },
    );

    it.each([
        { messages: [] },
        { messages: [{ role: "user", content: " " }] },
        { ...request, maxOutputTokens: 0 },
        { ...request, maxOutputTokens: 1.5 },
    ] as const)("rejects invalid requests before making calls", async (invalid) => {
        const { client, transport } = harness();
        await expect(client.generateText(invalid)).rejects.toMatchObject({ code: "invalid_request" });
        expect(transport).not.toHaveBeenCalled();
    });

    it("rejects invalid schema names and non-object schemas before making calls", async () => {
        const { client, transport } = harness();
        for (const output of [
            { ...summaryOutput, name: "invalid name" },
            { ...summaryOutput, jsonSchema: { type: "array" } },
        ]) {
            await expect(client.generateStructured(request, output)).rejects.toMatchObject({ code: "invalid_request" });
        }
        expect(transport).not.toHaveBeenCalled();
    });
});

describe("server LLM configuration", () => {
    it("requires an explicit key and model and defaults only the timeout", () => {
        expect(readOpenAiConfig({ OPENAI_API_KEY: "server-key", OPENAI_MODEL: "chosen-model" })).toEqual({
            apiKey: "server-key",
            model: "chosen-model",
            timeoutMs: DEFAULT_LLM_TIMEOUT_MS,
        });
        expect(readOpenAiConfig({ OPENAI_API_KEY: "server-key", OPENAI_MODEL: "chosen-model", LLM_TIMEOUT_MS: "1250" }).timeoutMs).toBe(
            1250,
        );
    });

    it.each([
        {},
        { OPENAI_API_KEY: "server-key" },
        { OPENAI_MODEL: "chosen-model" },
        { OPENAI_API_KEY: " ", OPENAI_MODEL: "chosen-model" },
        { OPENAI_API_KEY: "server-key", OPENAI_MODEL: " " },
        { OPENAI_API_KEY: "server-key\ninvalid", OPENAI_MODEL: "chosen-model" },
        { OPENAI_API_KEY: "server-key", OPENAI_MODEL: "chosen-model", LLM_TIMEOUT_MS: "invalid" },
    ])("fails invalid configuration without exposing secrets", (environment) => {
        expect(() => readOpenAiConfig(environment)).toThrowError("The LLM configuration is invalid.");
    });
});
