import { PermanentStageError, RetryableStageError } from "../processing/pipeline.ts";
import type { RecordingAudioStorage } from "../recording/audio-storage.ts";
import type { RecordingReference } from "../recording/model.ts";
import { tokenSchema, type TranscriptionProvider, type TranscriptToken } from "./model.ts";
import { openAsBlob } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";

export interface SonioxConfig {
    apiKey: string;
    model: string;
    baseUrl: string;
}
const identitySchema = z.object({ job: z.string().min(1), file: z.string().min(1) });
const idSchema = z.object({ id: z.string().min(1) });
const statusSchema = z.object({ status: z.enum(["queued", "processing", "completed", "error"]), error_type: z.string().nullish() });
const responseSchema = z.object({
    tokens: z.array(
        z.object({
            text: z.string(),
            start_ms: z.number().nonnegative().nullish(),
            end_ms: z.number().nonnegative().nullish(),
            language: z.string().nullish(),
            speaker: z.union([z.string(), z.number()]).nullish(),
            translation_status: z.enum(["original", "translation", "none"]).optional(),
        }),
    ),
});

export class SonioxTranscriptionProvider implements TranscriptionProvider {
    readonly provider = "soniox";
    readonly model: string;
    private readonly config: SonioxConfig;
    private readonly fetch: typeof fetch;
    private readonly audio: Pick<RecordingAudioStorage, "download">;
    constructor(config: SonioxConfig, fetchClient: typeof fetch, audio: Pick<RecordingAudioStorage, "download">) {
        this.config = config;
        this.model = config.model;
        this.fetch = fetchClient;
        this.audio = audio;
        if (!config.apiKey || !config.model)
            throw new PermanentStageError("SONIOX_CONFIGURATION", "Transcription is not configured. Contact support.");
    }
    private identity(id: string) {
        if (!id.startsWith("soniox-v1:"))
            throw new PermanentStageError(
                "TRANSCRIPTION_PROVIDER_CHANGED",
                "This lecture uses a different transcription provider. Contact support.",
            );

        return identitySchema.parse(JSON.parse(Buffer.from(id.slice("soniox-v1:".length), "base64url").toString()));
    }
    private async request(route: string, init: RequestInit = {}, allowMissing = false, deadline?: Date): Promise<unknown> {
        const timeout = Math.min(45_000, deadline ? deadline.getTime() - Date.now() : 45_000);
        if (timeout <= 0) throw new RetryableStageError("SONIOX_TIMEOUT", "Transcription timed out. Try again.");
        let response: Response;
        try {
            response = await this.fetch(`${this.config.baseUrl}${route}`, {
                ...init,
                headers: { ...init.headers, Authorization: `Bearer ${this.config.apiKey}` },
                signal: AbortSignal.timeout(timeout),
                redirect: "error",
            });
        } catch {
            throw new RetryableStageError("SONIOX_UNAVAILABLE", "Transcription is temporarily unavailable. Try again.");
        }
        if (allowMissing && response.status === 404) return;
        if (!response.ok) {
            if (response.status === 429 || response.status === 409 || response.status >= 500)
                throw new RetryableStageError("SONIOX_UNAVAILABLE", "Transcription is temporarily unavailable. Try again.");
            throw new PermanentStageError("SONIOX_REJECTED", "Transcription could not accept the request. Contact support.");
        }
        if (response.status === 204) return;
        try {
            return await response.json();
        } catch {
            throw new RetryableStageError("SONIOX_INVALID_RESPONSE", "Transcription returned an invalid response. Try again.");
        }
    }
    private async findExistingJob(reference: string, deadline?: Date) {
        let cursor: string | undefined;
        for (const page of [0, 1, 2]) {
            const result = z
                .object({
                    transcriptions: z.array(
                        z.object({ id: z.string(), file_id: z.string().nullish(), client_reference_id: z.string().nullish() }),
                    ),
                    next_page_cursor: z.string().nullish(),
                })
                .parse(
                    await this.request(
                        `/transcriptions?limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
                        {},
                        false,
                        deadline,
                    ),
                );
            const existing = result.transcriptions.find((job) => job.client_reference_id === reference);
            if (existing?.file_id) return { job: existing.id, file: existing.file_id };
            if (!result.next_page_cursor) return;
            cursor = result.next_page_cursor;
            if (page === 2)
                throw new RetryableStageError("SONIOX_RECONCILIATION_LIMIT", "Transcription recovery needs more time. Try again.");
        }
    }
    async submit(
        reference: string,
        chunk: { position: number; audioStartSeconds: number; endSeconds: number; recording?: RecordingReference },
        deadline?: Date,
    ) {
        if (!chunk.recording) throw new Error("Missing prepared audio identity");
        const existing = await this.findExistingJob(reference, deadline);
        if (existing) return `soniox-v1:${Buffer.from(JSON.stringify(existing)).toString("base64url")}`;
        const directory = await mkdtemp(path.join(tmpdir(), "classiq-soniox-"));
        try {
            const file = path.join(directory, "chunk.flac");
            await this.audio.download(chunk.recording, chunk.position, file, deadline);
            const form = new FormData();
            form.set("file", await openAsBlob(file, { type: "audio/flac" }), "chunk.flac");
            form.set("client_reference_id", reference);
            const uploaded = idSchema.parse(await this.request("/files", { method: "POST", body: form }, false, deadline));
            // client_reference_id is tracking, NOT a Soniox idempotency key. Claims/reconciliation live above transport.
            const job = idSchema.parse(
                await this.request(
                    "/transcriptions",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: this.model,
                            file_id: uploaded.id,
                            client_reference_id: reference,
                            language_hints: ["en", "es"],
                            enable_language_identification: true,
                            enable_speaker_diarization: true,
                            translation: { type: "one_way", target_language: "es" },
                        }),
                    },
                    false,
                    deadline,
                ),
            );

            return `soniox-v1:${Buffer.from(JSON.stringify({ job: job.id, file: uploaded.id })).toString("base64url")}`;
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    }
    async status(jobId: string, deadline?: Date) {
        const identity = this.identity(jobId);
        const job = statusSchema.parse(await this.request(`/transcriptions/${encodeURIComponent(identity.job)}`, {}, false, deadline));
        if (job.status === "completed") return "completed";
        if (job.status !== "error") return "pending";

        return job.error_type === "internal_error" ? "transient_error" : "permanent_error";
    }
    async collect(jobId: string, deadline?: Date): Promise<TranscriptToken[]> {
        const identity = this.identity(jobId);
        const result = responseSchema.parse(
            await this.request(`/transcriptions/${encodeURIComponent(identity.job)}/transcript`, {}, false, deadline),
        );
        const tokens: TranscriptToken[] = [];
        let language = "und";
        for (const token of result.tokens) {
            if (!token.text || ["<end>", "<fin>"].includes(token.text)) continue;
            if (token.translation_status === "translation") {
                tokens.push({ kind: "translation", text: token.text });
                continue;
            }
            if (token.start_ms === undefined || token.start_ms === null || token.end_ms === undefined || token.end_ms === null)
                throw new PermanentStageError("SONIOX_TOKEN_TIMES", "Transcription did not include usable timestamps. Contact support.");
            language = token.language ?? language;
            tokens.push(
                tokenSchema.parse({
                    kind: "speech",
                    text: token.text,
                    startSeconds: token.start_ms / 1000,
                    endSeconds: token.end_ms / 1000,
                    language,
                    speaker: token.speaker === undefined || token.speaker === null ? undefined : String(token.speaker),
                }),
            );
        }

        return tokens;
    }
    async release(jobId: string, deadline?: Date) {
        const identity = this.identity(jobId);
        await this.request(`/transcriptions/${encodeURIComponent(identity.job)}`, { method: "DELETE" }, true, deadline);
        await this.request(`/files/${encodeURIComponent(identity.file)}`, { method: "DELETE" }, true, deadline);
    }
}
