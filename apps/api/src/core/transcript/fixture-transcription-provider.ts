import { RetryableStageError } from "../processing/pipeline.ts";
import type { TranscriptToken, TranscriptionProvider } from "./model.ts";
import { z } from "zod";

export interface TranscriptionFixture {
    pendingChecks?: number;
    submitErrors?: number;
    statusErrors?: number;
    outcome?: "completed" | "transient_error" | "permanent_error";
    tokens?: TranscriptToken[];
    lostCallback?: boolean;
    duplicateCompletion?: boolean;
}
const jobInputSchema = z.object({
    reference: z.string(),
    position: z.number().int().nonnegative(),
    audioStartSeconds: z.number().nonnegative(),
    endSeconds: z.number().positive(),
});
type JobInput = z.infer<typeof jobInputSchema>;
interface FixtureJob {
    fixture: TranscriptionFixture;
    checks: number;
    errors: number;
    notified: boolean;
    tokens: TranscriptToken[];
}
export class FixtureTranscriptionProvider implements TranscriptionProvider {
    readonly provider = "development-fixture";
    readonly model = "fixture-v1";
    readonly calls = { submit: 0, created: 0, status: 0, collect: 0, notifications: 0 };
    private readonly fixtures: Readonly<Record<number, TranscriptionFixture>>;
    private readonly jobs = new Map<string, FixtureJob>();
    private readonly submitFailures = new Map<string, number>();
    constructor(fixtures: Readonly<Record<number, TranscriptionFixture>>) {
        this.fixtures = fixtures;
    }
    async submit(reference: string, chunk: { position: number; audioStartSeconds: number; endSeconds: number }) {
        this.calls.submit++;
        const fixture = this.fixtures[chunk.position] ?? {};
        const failures = this.submitFailures.get(reference) ?? 0;
        if (failures < (fixture.submitErrors ?? 0)) {
            this.submitFailures.set(reference, failures + 1);
            throw new RetryableStageError("FIXTURE_CAPACITY", "Transcription is temporarily unavailable.");
        }
        const input = { reference, position: chunk.position, audioStartSeconds: chunk.audioStartSeconds, endSeconds: chunk.endSeconds };
        const jobId = `fixture-v1:${Buffer.from(JSON.stringify(input)).toString("base64url")}`;
        if (!this.jobs.has(jobId)) {
            this.jobs.set(jobId, this.createJob(input));
            this.calls.created++;
        }

        return jobId;
    }
    async status(jobId: string) {
        this.calls.status++;
        const job = this.job(jobId);
        if (job.errors++ < (job.fixture.statusErrors ?? 0))
            throw new RetryableStageError("FIXTURE_NETWORK", "Transcription status is temporarily unavailable.");
        if (job.checks++ < (job.fixture.pendingChecks ?? 1)) return "pending";
        if (!job.notified && !job.fixture.lostCallback) {
            this.calls.notifications += job.fixture.duplicateCompletion ? 2 : 1;
            job.notified = true;
        }

        return job.fixture.outcome ?? "completed";
    }
    async collect(jobId: string) {
        this.calls.collect++;

        return structuredClone(this.job(jobId).tokens);
    }
    private createJob(input: JobInput): FixtureJob {
        const fixture = this.fixtures[input.position] ?? {};
        const startSeconds = Math.min(6, (input.endSeconds - input.audioStartSeconds) / 4);

        return {
            fixture,
            checks: 0,
            errors: 0,
            notified: false,
            tokens: fixture.tokens ?? [
                {
                    kind: "speech",
                    text: `Development fixture chunk ${input.position + 1}.`,
                    startSeconds,
                    endSeconds: startSeconds + Math.min(1, (input.endSeconds - input.audioStartSeconds) / 4),
                    language: "en",
                    speaker: "1",
                },
                { kind: "translation", text: `Texto de desarrollo ${input.position + 1}.` },
            ],
        };
    }
    private job(id: string) {
        let job = this.jobs.get(id);
        if (!job) {
            if (!id.startsWith("fixture-v1:")) throw new Error("Invalid fixture job identity.");
            const input = jobInputSchema.parse(JSON.parse(Buffer.from(id.slice("fixture-v1:".length), "base64url").toString()));
            job = this.createJob(input);
            this.jobs.set(id, job);
        }

        return job;
    }
}
