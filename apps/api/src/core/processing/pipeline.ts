export interface RetryPolicy {
    readonly errors: readonly string[];
    readonly intervalSeconds: number;
    readonly backoffRate: number;
    readonly maxAttempts: number;
    readonly maxDelaySeconds: number;
    readonly jitter: boolean;
}

export const transient: RetryPolicy = {
    errors: [
        "RetryableStageError",
        "Lambda.ServiceException",
        "Lambda.AWSLambdaException",
        "Lambda.SdkClientException",
        "Lambda.TooManyRequestsException",
    ],
    intervalSeconds: 10,
    backoffRate: 2,
    maxAttempts: 4,
    maxDelaySeconds: 300,
    jitter: true,
};

export type PipelineState =
    | {
          readonly type: "task";
          readonly next: string;
          readonly timeoutSeconds: number;
          readonly retry?: RetryPolicy;
          readonly catches?: Readonly<Record<string, string>>;
      }
    | { readonly type: "choice"; readonly field: string; readonly cases: Readonly<Record<string, string>>; readonly default: string }
    | {
          readonly type: "map";
          readonly itemsField: string;
          readonly iterator: PipelineDefinition;
          readonly resultField: string;
          readonly maxConcurrency: number;
          readonly next: string;
      }
    | { readonly type: "parallel"; readonly branches: readonly PipelineDefinition[]; readonly resultField: string; readonly next: string }
    | { readonly type: "wait"; readonly next: string; readonly seconds: number }
    | { readonly type: "succeed" }
    | { readonly type: "fail" };

export interface PipelineDefinition {
    readonly name: string;
    readonly startAt: string;
    readonly catch?: string;
    readonly timeoutSeconds?: number;
    readonly states: Readonly<Record<string, PipelineState>>;
}

export interface StageFailure {
    readonly code: string;
    readonly message: string;
}

export interface StageContext {
    readonly runId: string;
    readonly attempt: number;
    readonly deadline: Date;
    readonly failure?: StageFailure;
}

export type StageHandler<S> = (input: S, context: StageContext) => Promise<S>;

export interface Execution<S> {
    readonly runId: string;
    readonly input: S;
    readonly failure?: { readonly Error: string; readonly Cause: string };
}

export class RetryableStageError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = "RetryableStageError";
        this.code = code;
    }
}

export class PermanentStageError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = "PermanentStageError";
        this.code = code;
    }
}

export function definePipeline<const P extends PipelineDefinition>(definition: P): P {
    const targets = [definition.startAt, definition.catch];
    if (definition.timeoutSeconds !== undefined && (!Number.isInteger(definition.timeoutSeconds) || definition.timeoutSeconds < 1)) {
        throw new Error("Pipeline timeout must be a positive whole number of seconds.");
    }

    for (const state of Object.values(definition.states)) {
        if (state.type === "task" || state.type === "wait" || state.type === "map" || state.type === "parallel") {
            targets.push(state.next);
        }
        if (state.type === "choice") {
            targets.push(state.default, ...Object.values(state.cases));
            if (!state.field || Object.keys(state.cases).length === 0) {
                throw new Error("Choices need a field and string cases.");
            }
        }
        if (state.type === "map" || state.type === "parallel") {
            if (!state.resultField) {
                throw new Error("Nested states need a result field.");
            }
            if (state.type === "map") {
                if (!state.itemsField || !Number.isInteger(state.maxConcurrency) || state.maxConcurrency < 1 || state.maxConcurrency > 40) {
                    throw new Error("Inline maps need an items field and concurrency between 1 and 40.");
                }
                if (state.iterator.timeoutSeconds !== undefined) throw new Error("Only the root pipeline has an execution timeout.");
                definePipeline(state.iterator);
            } else {
                if (state.branches.length === 0) {
                    throw new Error("Parallel states need at least one branch.");
                }
                for (const branch of state.branches) {
                    if (branch.timeoutSeconds !== undefined) throw new Error("Only the root pipeline has an execution timeout.");
                    definePipeline(branch);
                }
            }
        }
        if (state.type === "task") {
            targets.push(...Object.values(state.catches ?? {}));
            if (!Number.isInteger(state.timeoutSeconds) || state.timeoutSeconds < 1 || state.timeoutSeconds > 900) {
                throw new Error("Task timeouts must be between 1 and 900 seconds.");
            }
            const retry = state.retry;
            if (
                retry &&
                (retry.errors.length === 0 ||
                    !Number.isInteger(retry.intervalSeconds) ||
                    retry.intervalSeconds < 1 ||
                    !Number.isFinite(retry.backoffRate) ||
                    retry.backoffRate < 1 ||
                    !Number.isInteger(retry.maxAttempts) ||
                    retry.maxAttempts < 0 ||
                    !Number.isInteger(retry.maxDelaySeconds) ||
                    retry.maxDelaySeconds < 1)
            ) {
                throw new Error("Invalid pipeline retry policy.");
            }
        }
        if (state.type === "wait" && (!Number.isInteger(state.seconds) || state.seconds < 0)) {
            throw new Error("Waits must use a nonnegative whole number of seconds.");
        }
    }
    if (targets.some((target) => target !== undefined && !Object.hasOwn(definition.states, target))) {
        throw new Error("Pipeline transitions must name existing states.");
    }
    if (definition.catch && definition.states[definition.catch]?.type !== "task") {
        throw new Error("The failure handler must be a task.");
    }

    return definition;
}

export function retryDelay(policy: RetryPolicy, attempt: number, random: () => number): number {
    const ceiling = Math.min(policy.maxDelaySeconds, policy.intervalSeconds * policy.backoffRate ** (attempt - 1));

    return Math.floor(policy.jitter ? random() * ceiling : ceiling);
}

export function stageFailure(error: unknown): StageFailure {
    if (error instanceof RetryableStageError || error instanceof PermanentStageError) {
        return { code: error.code, message: error.message };
    }

    return { code: "PROCESSING_FAILED", message: "Processing failed. Try again." };
}

export function stateField(input: unknown, field: string): unknown {
    if (typeof input !== "object" || input === null || !Object.hasOwn(input, field)) {
        return undefined;
    }

    return Reflect.get(input, field);
}

export function assertPayload(value: unknown): void {
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > 256 * 1024) {
        throw new Error("Processing state exceeds the 256 KiB payload limit.");
    }
}

export function matchesError(errors: readonly string[], name: string): boolean {
    return (
        errors.includes(name) ||
        (name !== "States.Runtime" &&
            name !== "States.DataLimitExceeded" &&
            (errors.includes("States.ALL") || (name !== "States.Timeout" && errors.includes("States.TaskFailed"))))
    );
}
