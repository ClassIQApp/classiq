import { executionSchema, readFailure } from "./lambda-stage-handler.ts";
import {
    assertPayload,
    matchesError,
    retryDelay,
    stageFailure,
    stateField,
    type Execution,
    type PipelineDefinition,
    type StageHandler,
} from "./pipeline.ts";
import { createHash } from "node:crypto";
import pTimeout from "p-timeout";
import { z } from "zod";

interface Frame<S> {
    readonly path: string[];
    readonly state: string;
    readonly input: S;
    readonly failure?: Execution<S>["failure"];
    readonly index: number;
    readonly results: S[];
}

export interface Continuation<S> extends Execution<S> {
    readonly deliveryId?: string;
    readonly pipeline: string;
    readonly state: string;
    readonly attempt: number;
    readonly notBefore?: number;
    readonly path?: string[];
    readonly frames?: Frame<S>[];
    readonly deadline?: number;
}

export interface Transition {
    readonly runId: string;
    readonly state: string;
    readonly attempt: number;
    readonly outcome: "succeeded" | "failed" | "continued" | "retry" | "caught";
    readonly error?: unknown;
}

export function encodeContinuation<S>(message: Continuation<S>): string {
    assertPayload(message);

    return JSON.stringify(message);
}

export class ContinuationRunner<S> {
    private readonly pipeline: PipelineDefinition;
    private readonly handlers: Readonly<Record<string, StageHandler<S>>>;
    private readonly input: z.ZodType<S>;
    private readonly enqueue: (body: string, delaySeconds: number) => Promise<void>;
    private readonly log: (transition: Transition) => void;
    private readonly random: () => number;

    constructor(
        pipeline: PipelineDefinition,
        handlers: Readonly<Record<string, StageHandler<S>>>,
        input: z.ZodType<S>,
        enqueue: (body: string, delaySeconds: number) => Promise<void>,
        log: (transition: Transition) => void,
        random = Math.random,
    ) {
        const validateHandlers = (definition: PipelineDefinition) => {
            for (const [name, state] of Object.entries(definition.states)) {
                if (state.type === "task" && !Object.hasOwn(handlers, name)) {
                    throw new Error(`Missing processing handler: ${name}`);
                }
                if (state.type === "map") validateHandlers(state.iterator);
                if (state.type === "parallel") {
                    for (const branch of state.branches) validateHandlers(branch);
                }
            }
        };
        validateHandlers(pipeline);
        this.pipeline = pipeline;
        this.handlers = handlers;
        this.input = input;
        this.enqueue = enqueue;
        this.log = log;
        this.random = random;
    }

    async start(runId: string, input: S, deadline?: Date): Promise<void> {
        await this.send({
            runId,
            input: this.input.parse(input),
            state: this.pipeline.startAt,
            attempt: 1,
            deadline: deadline?.getTime() ?? (this.pipeline.timeoutSeconds ? Date.now() + this.pipeline.timeoutSeconds * 1000 : undefined),
        });
    }

    async process(body: string): Promise<void> {
        if (Buffer.byteLength(body, "utf8") > 256 * 1024) {
            throw new Error("Processing state exceeds the 256 KiB payload limit.");
        }
        const message = executionSchema(this.input)
            .extend({
                deliveryId: z.string().optional(),
                pipeline: z.literal(this.pipeline.name),
                state: z.string(),
                attempt: z.int().positive(),
                notBefore: z.number().finite().optional(),
                deadline: z.number().finite().optional(),
                path: z.array(z.string()).default([]),
                frames: z
                    .array(
                        z.object({
                            path: z.array(z.string()),
                            state: z.string(),
                            input: this.input,
                            failure: executionSchema(this.input).shape.failure,
                            index: z.int().nonnegative(),
                            results: z.array(this.input),
                        }),
                    )
                    .default([]),
            })
            .parse(JSON.parse(body));
        const pipeline = this.resolve(message.path);
        const state = pipeline.states[message.state];
        if (!state || !Object.hasOwn(pipeline.states, message.state)) {
            throw new Error(`Unknown processing state: ${message.state}`);
        }
        if (message.deadline !== undefined && Date.now() >= message.deadline) {
            this.log({
                runId: message.runId,
                state: message.state,
                attempt: message.attempt,
                outcome: "failed",
                error: new Error("Execution deadline expired."),
            });

            return;
        }
        if (message.notBefore !== undefined && message.notBefore > Date.now()) {
            await this.send(message);

            return;
        }

        const execution = {
            deliveryId: message.deliveryId ?? createHash("sha256").update(body).digest("hex"),
            runId: message.runId,
            input: message.input,
            failure: message.failure,
            path: message.path,
            frames: message.frames,
            deadline: message.deadline,
        };
        const log = (outcome: Transition["outcome"], error?: unknown) =>
            this.log({ runId: message.runId, state: message.state, attempt: message.attempt, outcome, error });

        switch (state.type) {
            case "succeed":
                if (message.frames.length > 0) {
                    await this.completeChild(message);
                    log("continued");

                    return;
                }
                log("succeeded");

                return;
            case "fail":
                await this.routeFailure(message, { Error: "ProcessingFailed", Cause: "A processing stage failed." }, true);
                log("failed");

                return;
            case "choice": {
                const value = stateField(message.input, state.field);
                const next = typeof value === "string" && Object.hasOwn(state.cases, value) ? state.cases[value]! : state.default;
                await this.send({ ...execution, state: next, attempt: 1 });
                log("continued");

                return;
            }
            case "map":
            case "parallel": {
                const frame: Frame<S> = {
                    path: message.path,
                    state: message.state,
                    input: message.input,
                    failure: message.failure,
                    index: 0,
                    results: [],
                };
                await this.nextChild(message, frame);
                log("continued");

                return;
            }
            case "wait":
                await this.send({ ...execution, state: state.next, attempt: 1, notBefore: Date.now() + state.seconds * 1000 });
                log("continued");

                return;
            case "task": {
                let result: S;
                const timeout = new Error("Processing stage timed out.");
                timeout.name = "States.Timeout";
                try {
                    result = this.input.parse(
                        await pTimeout(
                            this.handlers[message.state]!(message.input, {
                                runId: message.runId,
                                attempt: message.attempt,
                                deadline: new Date(Math.min(message.deadline ?? Infinity, Date.now() + state.timeoutSeconds * 1000)),
                                failure: readFailure(message.failure),
                            }),
                            {
                                milliseconds: Math.min(state.timeoutSeconds * 1000, (message.deadline ?? Infinity) - Date.now()),
                                message: timeout,
                            },
                        ),
                    );
                    assertPayload({ ...execution, input: result });
                } catch (error) {
                    const policy = state.retry;
                    if (
                        policy &&
                        error instanceof Error &&
                        matchesError(policy.errors, error.name) &&
                        message.attempt <= policy.maxAttempts
                    ) {
                        const delay = retryDelay(policy, message.attempt, this.random);
                        await this.send({ ...message, attempt: message.attempt + 1, notBefore: Date.now() + delay * 1000 });
                        log("retry", error);

                        return;
                    }
                    await this.routeFailure(message, {
                        Error: error instanceof Error ? error.name : "Error",
                        Cause: JSON.stringify(stageFailure(error)),
                    });
                    log("caught", error);

                    return;
                }
                // Queue failures are transport failures, not stage failures. Leave the original unacknowledged.
                await this.send({ ...execution, input: result, state: state.next, attempt: 1 });
                log("continued");
            }
        }
    }

    private resolve(path: readonly string[]): PipelineDefinition {
        let pipeline = this.pipeline;
        for (const [i, name] of path.entries()) {
            if (i % 2 !== 0) continue;
            const state = pipeline.states[name];
            if (state?.type === "map") pipeline = state.iterator;
            else if (state?.type === "parallel" && state.branches[Number(path[i + 1])]) pipeline = state.branches[Number(path[i + 1])]!;
            else throw new Error("Invalid nested pipeline path.");
        }

        return pipeline;
    }

    private async nextChild(message: Continuation<S>, frame: Frame<S>): Promise<void> {
        const state = this.resolve(frame.path).states[frame.state];
        if (state?.type !== "map" && state?.type !== "parallel") throw new Error("Invalid parent state.");
        const items = state.type === "map" ? stateField(frame.input, state.itemsField) : state.branches.map(() => frame.input);
        if (!Array.isArray(items)) throw new Error("Map input must be an array.");
        if (frame.index >= items.length) {
            const input = this.input.parse({ ...frame.input, [state.resultField]: { values: frame.results } });
            await this.send({
                ...message,
                input,
                failure: frame.failure,
                path: frame.path,
                state: state.next,
                attempt: 1,
                notBefore: undefined,
            });

            return;
        }
        const child = state.type === "map" ? state.iterator : state.branches[frame.index]!;
        await this.send({
            ...message,
            input: this.input.parse(items[frame.index]),
            failure: state.type === "map" ? undefined : frame.failure,
            state: child.startAt,
            path: [...frame.path, frame.state, String(frame.index)],
            frames: [...(message.frames ?? []), frame],
            attempt: 1,
            notBefore: undefined,
        });
    }

    private async completeChild(message: Continuation<S>): Promise<void> {
        const frames = [...(message.frames ?? [])];
        const frame = frames.pop()!;
        await this.nextChild({ ...message, frames }, { ...frame, index: frame.index + 1, results: [...frame.results, message.input] });
    }

    private async routeFailure(message: Continuation<S>, failure: NonNullable<Execution<S>["failure"]>, skipCatch = false): Promise<void> {
        const path = message.path ?? [];
        const pipeline = this.resolve(path);
        const state = pipeline.states[message.state];
        const target =
            state?.type === "task"
                ? (Object.entries(state.catches ?? {})
                      .filter(([name]) => name !== "States.ALL")
                      .find(([name]) => matchesError([name], failure.Error))?.[1] ?? state.catches?.["States.ALL"])
                : undefined;
        if (!skipCatch && target) {
            await this.send({ ...message, state: target, failure, attempt: 1, notBefore: undefined });

            return;
        }
        if (!skipCatch && pipeline.catch && message.state !== pipeline.catch) {
            await this.send({ ...message, state: pipeline.catch, failure, attempt: 1, notBefore: undefined });

            return;
        }
        const frames = [...(message.frames ?? [])];
        const frame = frames.pop();
        if (frame) {
            await this.routeFailure({ ...message, ...frame, frames, attempt: 1 }, failure);
        }
    }

    private async send(message: Omit<Continuation<S>, "pipeline">): Promise<void> {
        const delay = Math.min(900, Math.max(0, Math.ceil(((message.notBefore ?? Date.now()) - Date.now()) / 1000)));

        const { deliveryId: parent, ...identity } = message;
        delete identity.notBefore;
        const deliveryId = createHash("sha256")
            .update(JSON.stringify({ parent, ...identity, pipeline: this.pipeline.name }))
            .digest("hex");
        await this.enqueue(encodeContinuation({ ...message, deliveryId, pipeline: this.pipeline.name }), delay);
    }
}
