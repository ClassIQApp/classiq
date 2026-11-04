import { LlmError } from "../ai/errors.ts";
import type { LlmService } from "../ai/llm-service.ts";
import { PermanentStageError, RetryableStageError } from "../processing/pipeline.ts";
import type { Transcript } from "../transcript/model.ts";
import {
    summarySchema,
    keyTermsSchema,
    type ContentKind,
    type LectureContentRepository,
    type LectureReference,
    type StoredContent,
} from "./model.ts";

export async function generateContent(
    reference: LectureReference,
    kind: ContentKind,
    transcript: Transcript,
    repository: LectureContentRepository,
    llm: LlmService,
    deadline: Date,
): Promise<void> {
    const existing = await repository.read(reference, kind);
    if (existing?.sourceHash === transcript.contentHash) return;
    const remainingMs = deadline.getTime() - Date.now();
    if (remainingMs <= 0) throw new PermanentStageError("PROCESSING_TIMEOUT", "Processing timed out. Try again.");
    const request = {
        messages: [
            {
                role: "system" as const,
                content:
                    kind === "summary"
                        ? "Summarize the lecture in clear paragraphs. Use only the supplied transcript; preserve its language and do not invent facts. Return {text}."
                        : "Identify the lecture's key topics and terms. Explain each using only the transcript, preserving its language. Return {terms:[{term,explanation,sources:[{startSeconds,endSeconds}]}]}; cite relevant spoken time ranges.",
            },
            {
                role: "user" as const,
                content: JSON.stringify({
                    kind,
                    segments: transcript.segments.map(({ text, startSeconds, endSeconds }) => ({ text, startSeconds, endSeconds })),
                }),
            },
        ],
        maxOutputTokens: 4096,
    };
    const options = { timeoutMs: Math.min(120_000, remainingMs) };
    let output: StoredContent;
    try {
        if (kind === "summary") {
            const response = await llm.generateStructured(request, summarySchema, options);
            output = {
                kind,
                content: response.data,
                sourceHash: transcript.contentHash,
                provider: response.provider,
                model: response.model,
            };
        } else {
            const response = await llm.generateStructured(request, keyTermsSchema, options);
            const terms = response.data.terms
                .map((term) => ({
                    ...term,
                    sources: term.sources.filter(
                        (range) =>
                            range.endSeconds > range.startSeconds &&
                            range.endSeconds <= transcript.durationSeconds &&
                            transcript.segments.some(
                                (segment) => range.startSeconds < segment.endSeconds && range.endSeconds > segment.startSeconds,
                            ),
                    ),
                }))
                .filter((term) => term.sources.length > 0);
            if (terms.length === 0) throw new LlmError("invalid_response");
            output = { kind, content: { terms }, sourceHash: transcript.contentHash, provider: response.provider, model: response.model };
        }
    } catch (error) {
        const message =
            kind === "summary" ? "Summary generation failed. Retry processing." : "Key-term generation failed. Retry processing.";
        if (error instanceof LlmError && (error.retryable || error.code === "timeout"))
            throw new RetryableStageError("GENERATION_UNAVAILABLE", message);
        throw new PermanentStageError("GENERATION_FAILED", message);
    }
    await repository.save(reference, output);
}
