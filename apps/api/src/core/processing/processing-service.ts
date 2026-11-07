import type { PostgresProcessingRepository, ProcessingSubject } from "./postgres-processing-repository.ts";

export interface PipelineStart {
    readonly pipeline: "resource" | "lecture";
    readonly runId: string;
    readonly input: ProcessingSubject;
    readonly deadline: Date;
}
export type PipelineStarter = (request: PipelineStart) => Promise<void>;

export class ProcessingService {
    private readonly repository: PostgresProcessingRepository;
    private readonly starter: PipelineStarter;

    constructor(repository: PostgresProcessingRepository, starter: PipelineStarter) {
        this.repository = repository;
        this.starter = starter;
    }

    async start(subject: ProcessingSubject, stages: readonly string[], timeoutSeconds: number) {
        const { run, created } = await this.repository.begin(subject, stages, timeoutSeconds);
        if (!created) return run;
        try {
            await this.starter({ pipeline: subject.kind, runId: run.id, input: subject, deadline: run.deadline });
            await this.repository.dispatched(run.id);
        } catch {
            // A send can succeed before its response is lost. Any late delivery is fenced by this terminal run.
            await this.repository.fail(subject, run.id, "START_FAILED", "Processing could not start. Try again.");
        }

        return (await this.repository.current(subject))!;
    }
    async recoverStarts() {
        for (const pending of await this.repository.pendingStarts()) {
            try {
                await this.starter({ ...pending, pipeline: pending.input.kind });
                await this.repository.dispatched(pending.runId);
            } catch {
                // Leave this active run pending until the next sweep or its persisted deadline.
            }
        }
    }
}
