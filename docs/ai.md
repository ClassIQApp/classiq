# Shared LLM integration

Server AI features use `apps/api/src/core/ai/index.ts`. The client provides typed text and structured requests, parsing, deadlines, cancellation, and consistent failures. OpenAI is the first adapter; feature code depends on `LlmClient`, not on a provider API or SDK.

## Server configuration

The composition root supplies an environment map. Nothing reads global environment variables or creates a provider on import, so existing API routes still run without AI credentials.

```ts
import { createLlmClient, createOpenAiProvider, readOpenAiConfig } from "../core/ai/index.ts";

export function createAiClient(environment: Readonly<Record<string, string | undefined>>) {
    const config = readOpenAiConfig(environment);

    return createLlmClient(createOpenAiProvider(config), { timeoutMs: config.timeoutMs });
}
```

Set these values in the **server** runtime:

- `OPENAI_API_KEY`: required secret, supplied by deployment configuration or a local untracked environment file.
- `OPENAI_MODEL`: required model ID chosen by the application. There is deliberately no default model. Structured calls require a model supporting Structured Outputs.
- `LLM_TIMEOUT_MS`: optional positive integer, default `30000`; maximum `2147483647` to fit a Node timer.

Passing `config.timeoutMs` into `createLlmClient` applies the configured deadline. The provider does not enforce it on its own. Both configuration helpers reject missing keys, models, invalid header values, and invalid timeouts with `invalid_configuration`.

Keep the module, configuration, and client instance in server code. The adapter uses the Node HTTP header validator and belongs to the API application. Do not import it into the website or put the key in a `VITE_*` variable. Responses and errors contain no API keys.

## Feature calls

```ts
const result = await ai.generateText(
    {
        messages: [
            { role: "system", content: "Summarize the provided lesson accurately." },
            { role: "user", content: lessonText },
        ],
        maxOutputTokens: 512,
    },
    { signal: callerSignal, timeoutMs: 15000 },
);

const summary: string = result.data;
```

Messages support `system`, `user`, and `assistant` roles with nonempty text. `maxOutputTokens` is optional and must be a positive integer. A response contains `data`, `provider`, the resolved `model`, `responseId`, optional provider `requestId`, and token `usage` when available. Raw provider envelopes and reasoning items are not returned.

Structured output definitions pair a JSON Schema with a validator that receives `unknown` and returns the feature's type. The client parses JSON before calling the validator and converts either JSON or validation failures to `invalid_response`.

```ts
import type { StructuredOutput } from "../core/ai/index.ts";

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
            throw new Error("Expected a nonempty summary.");
        }

        return { summary: value.summary };
    },
};

const result = await ai.generateStructured({ messages: [{ role: "user", content: lessonText }], maxOutputTokens: 512 }, summaryOutput, {
    signal: callerSignal,
});

const summary: string = result.data.summary;
```

Validators must check the data rather than cast it; they should be synchronous and lightweight. Keep the schema and validator aligned, including any feature-specific constraints. Schema names accept 1–64 letters, digits, underscores, or hyphens. The root must be an object; use the provider's supported JSON Schema subset, including required fields and `additionalProperties: false`. A future feature can wrap its validation library's `parse` function without changing the integration.

## Failures and deadlines

All public client failures are `LlmError` instances. Inspect `code` and `retryable`; do not match message strings. Codes are `invalid_configuration`, `invalid_request`, `cancelled`, `timeout`, `provider_error`, `invalid_response`, `refused`, and `incomplete`.

Errors carry only a generic message and optional provider name, HTTP status, and request ID. Provider bodies, transport errors, validator details, abort reasons, and error causes are not attached. HTTP `408`, `409`, `429`, and `5xx`, network failures, and deadlines are marked retryable. The layer makes one attempt; retry policy belongs to its caller. A failed response without a known transient reason is not marked retryable.

The deadline covers the provider call, reading its body, and response validation. It aborts the transport and rejects the caller even if a transport ignores abort. Caller cancellation remains `cancelled`, and an already-cancelled request never calls the provider. Timers and caller listeners are removed on completion. Providers must honor the supplied signal; synchronous feature validators should not block the event loop.

## Provider boundary and verification

Implement `LlmProvider.generate(request, signal)` to replace OpenAI, then pass it into `createLlmClient`. Providers return normalized text and metadata and reject refusals or incomplete responses before returning text. `createOpenAiProvider` is a lower-level one-attempt adapter; call it through the shared client to obtain deadlines, cancellation classification, request validation, structured parsing, and normalized network errors.

The OpenAI adapter sends text-only, non-streaming requests to `POST /v1/responses` with `store: false`. Structured requests use strict `text.format` JSON Schema. The implementation follows the official [Responses reference](https://developers.openai.com/api/reference/resources/responses/methods/create) and [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs). Tools, streaming, feature endpoints, and retry orchestration are outside this foundation.

`pnpm --filter @classiq/api test` exercises success, request/config validation, cancellation, timeouts including stalled body reads, provider and network errors, malformed envelopes, malformed JSON, validator failures, refusals, and incomplete output through an injected transport. Tests make no live provider requests and need no API credentials.
