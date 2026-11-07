import { generateAsl } from "./asl.ts";
import { ContinuationRunner, type Transition } from "./continuation-runner.ts";
import { lambdaStageHandler } from "./lambda-stage-handler.ts";
import { definePipeline, PermanentStageError, type PipelineDefinition, type StageHandler } from "./pipeline.ts";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";

const schema = z.looseObject({ id: z.string(), status: z.string().optional() });
type Input = z.infer<typeof schema>;
const leaf = definePipeline({
    name: "leaf",
    startAt: "Work",
    states: {
        Work: { type: "task", next: "Done", timeoutSeconds: 2 },
        Done: { type: "succeed" },
    },
});
const branch = definePipeline({
    name: "branch",
    startAt: "Items",
    states: {
        Items: { type: "map", itemsField: "items", iterator: leaf, resultField: "collected", maxConcurrency: 10, next: "Done" },
        Done: { type: "succeed" },
    },
});
const pipeline = definePipeline({
    name: "nested",
    startAt: "Status",
    catch: "RecordFailure",
    timeoutSeconds: 30,
    states: {
        Status: { type: "choice", field: "status", cases: { ready: "Branches" }, default: "Done" },
        Branches: { type: "parallel", branches: [branch, leaf], resultField: "branches", next: "Publish" },
        Publish: { type: "task", timeoutSeconds: 2, next: "Done" },
        RecordFailure: { type: "task", timeoutSeconds: 2, next: "Failed" },
        Failed: { type: "fail" },
        Done: { type: "succeed" },
    },
});

afterEach(() => vi.useRealTimers());

function fixture(work: StageHandler<Input>) {
    const queue: string[] = [];
    const transitions: Transition[] = [];
    const publish = vi.fn<StageHandler<Input>>(async (value) => value);
    const failure = vi.fn<StageHandler<Input>>(async (value) => value);
    const handlers = { Work: work, Publish: publish, RecordFailure: failure };
    const runner = new ContinuationRunner(
        pipeline,
        handlers,
        schema,
        async (body) => {
            queue.push(body);
        },
        (value) => transitions.push(value),
    );

    return { runner, queue, publish, failure, handlers, transitions };
}

it("preserves nested parent inputs and ordered child results under duplicate delivery", async () => {
    const work = vi.fn<StageHandler<Input>>(async (value) => ({ ...value, status: "processed" }));
    const f = fixture(work);
    const input = { id: "parent", status: "ready", items: [{ id: "b" }, { id: "a" }] };
    await f.runner.start("run", input);
    // Coalesce identical queued bodies only to bound this duplicate-delivery experiment.
    const seen = new Set<string>();
    while (f.queue.length > 0) {
        const body = f.queue.shift()!;
        if (seen.has(body)) continue;
        seen.add(body);
        await f.runner.process(body);
        await f.runner.process(body);
    }
    const actual = f.publish.mock.calls[0]![0];
    expect(actual).toEqual({
        ...input,
        branches: {
            values: [
                {
                    ...input,
                    collected: {
                        values: [
                            { id: "b", status: "processed" },
                            { id: "a", status: "processed" },
                        ],
                    },
                },
                { ...input, status: "processed" },
            ],
        },
    });
    expect(work.mock.calls.filter(([value]) => value.id === "a")).toHaveLength(2);
    expect(f.failure).not.toHaveBeenCalled();

    // Execute the emitted graph independently, using the actual Lambda envelope adapter.
    async function execute(definition: PipelineDefinition, value: Input, asl = generateAsl(definition)): Promise<Input> {
        let name = asl.StartAt;
        let steps = 0;
        while (steps++ < 30) {
            const state = asl.States[name]!;
            const localName = name.split("/").at(-1)!;
            const domain = definition.states[localName]!;
            switch (state.Type) {
                case "Succeed":
                    return value;
                case "Task": {
                    const handler = f.handlers[localName as keyof typeof f.handlers];
                    expect(state.Parameters).toMatchObject({ FunctionName: `\${${localName}FunctionArn}` });
                    const result = await lambdaStageHandler(handler, schema)(
                        { envelope: { runId: "run", input: value }, retryCount: 0, timeoutSeconds: state.TimeoutSeconds },
                        { getRemainingTimeInMillis: () => 2000 },
                    );
                    value = result.input;
                    break;
                }
                case "Choice": {
                    expect(domain.type).toBe("choice");
                    const rules = z
                        .array(
                            z.object({
                                And: z.array(
                                    z.object({
                                        Variable: z.string(),
                                        StringEquals: z.string().optional(),
                                        IsPresent: z.boolean().optional(),
                                        IsString: z.boolean().optional(),
                                    }),
                                ),
                                Next: z.string(),
                            }),
                        )
                        .parse(state.Choices);
                    expect(rules[0]?.And[0]?.Variable).toBe("$.input['status']");
                    name =
                        rules.find((rule) => rule.And.some((condition) => condition.StringEquals === value.status))?.Next ??
                        String(state.Default);
                    continue;
                }
                case "Map": {
                    if (domain.type !== "map") throw new Error("Definition drift");
                    const childAsl = z
                        .object({ StartAt: z.string(), States: z.record(z.string(), z.record(z.string(), z.any())) })
                        .parse(state.ItemProcessor);
                    expect(childAsl.StartAt).toBe(`${name}/${domain.iterator.startAt}`);
                    expect(state.ItemsPath).toBe("$.input['items']");
                    expect(state.MaxConcurrency).toBe(domain.maxConcurrency);
                    const values: Input[] = [];
                    for (const item of z.array(schema).parse(value.items)) values.push(await execute(domain.iterator, item, childAsl));
                    value = { ...value, [domain.resultField]: { values } };
                    break;
                }
                case "Parallel": {
                    if (domain.type !== "parallel") throw new Error("Definition drift");
                    const branchAsl = z
                        .array(z.object({ StartAt: z.string(), States: z.record(z.string(), z.record(z.string(), z.any())) }))
                        .parse(state.Branches);
                    // Reverse execution order while retaining result positions.
                    const values: Input[] = [];
                    for (const [index, child] of [...domain.branches.entries()].toReversed())
                        values[index] = await execute(child, structuredClone(value), branchAsl[index]!);
                    value = { ...value, [domain.resultField]: { values } };
                    break;
                }
                default:
                    throw new Error(`Unexpected ASL state ${String(state.Type)}`);
            }
            if (domain.type === "map" || domain.type === "parallel") {
                expect(state.ResultSelector).toEqual({ "values.$": "$[*].input" });
                expect(state.ResultPath).toBe(`$.input['${domain.resultField}']`);
            }
            name = String(state.Next);
        }
        throw new Error("Unbounded graph");
    }
    expect(await execute(pipeline, input)).toEqual(actual);
});

it("propagates uncaught nested failures to the parent catch with the parent input", async () => {
    const f = fixture(async () => {
        throw new PermanentStageError("BAD_CHUNK", "Upload again.");
    });
    const input = { id: "parent", status: "ready", items: [{ id: "child" }] };
    await f.runner.start("run", input);
    while (f.queue.length > 0) await f.runner.process(f.queue.shift()!);
    expect(f.failure.mock.calls[0]?.[0]).toEqual(input);
    expect(f.failure.mock.calls[0]?.[1].failure).toEqual({ code: "BAD_CHUNK", message: "Upload again." });
    expect(f.publish).not.toHaveBeenCalled();
    expect(generateAsl(pipeline).States.Branches).toMatchObject({ Catch: [{ Next: "RecordFailure", ResultPath: "$.failure" }] });
});

it("handles empty maps, default choices, deadlines and nested payload growth", async () => {
    vi.useFakeTimers();
    const f = fixture(async (value) => value);
    await f.runner.start("empty", { id: "parent", status: "ready", items: [] });
    while (f.queue.length > 0) await f.runner.process(f.queue.shift()!);
    expect(f.publish.mock.calls[0]?.[0]).toMatchObject({ branches: { values: [{ collected: { values: [] } }, { id: "parent" }] } });
    await f.runner.start("default", { id: "parent", status: "unknown" });
    while (f.queue.length > 0) await f.runner.process(f.queue.shift()!);
    expect(f.publish).toHaveBeenCalledTimes(1);
    await f.runner.start("expired", { id: "parent", status: "ready" });
    vi.setSystemTime(Date.now() + 30_000);
    await f.runner.process(f.queue.shift()!);
    expect(f.queue).toHaveLength(0);
    expect(f.transitions.at(-1)?.outcome).toBe("failed");
    const lambda = lambdaStageHandler(async (value) => ({ ...value, text: "é".repeat(140_000) }), schema);
    await expect(
        lambda(
            { envelope: { runId: "run", input: { id: "1" } }, retryCount: 0, timeoutSeconds: 1 },
            { getRemainingTimeInMillis: () => 1000 },
        ),
    ).rejects.toThrow("256 KiB");
    expect(() =>
        definePipeline({ ...pipeline, states: { ...pipeline.states, Branches: { ...pipeline.states.Branches, branches: [] } } }),
    ).toThrow("at least one");
});

it("waits for external work without holding a handler and bounds a lost completion", async () => {
    vi.useFakeTimers();
    const polling = definePipeline({
        name: "external",
        timeoutSeconds: 4000,
        startAt: "Submit",
        states: {
            Submit: { type: "task", timeoutSeconds: 2, next: "Pause" },
            Pause: { type: "wait", seconds: 1801, next: "Check" },
            Check: { type: "task", timeoutSeconds: 2, next: "Status" },
            Status: { type: "choice", field: "status", cases: { completed: "Done" }, default: "Pause" },
            Done: { type: "succeed" },
        },
    });
    const queue: { body: string; delay: number }[] = [];
    const transitions: Transition[] = [];
    const submit = vi.fn<StageHandler<Input>>(async (value) => ({ ...value, status: "pending" }));
    const check = vi.fn<StageHandler<Input>>(async (value) => ({ ...value, status: "completed" }));
    const runner = new ContinuationRunner(
        polling,
        { Submit: submit, Check: check },
        schema,
        async (body, delay) => {
            queue.push({ body, delay });
        },
        (value) => transitions.push(value),
    );
    async function drain() {
        let count = 0;
        while (queue.length > 0 && count++ < 30) {
            const message = queue.shift()!;
            vi.setSystemTime(Date.now() + message.delay * 1000);
            await runner.process(message.body);
        }
        expect(queue).toHaveLength(0);
    }
    await runner.start("completed", { id: "1" });
    await drain();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledTimes(1);
    expect(transitions.at(-1)?.outcome).toBe("succeeded");
    check.mockImplementation(async (value) => value);
    await runner.start("lost", { id: "2" });
    await drain();
    expect(transitions.at(-1)?.outcome).toBe("failed");
    expect(generateAsl(polling).TimeoutSeconds).toBe(4000);
});

it("routes named task failures before the pipeline catch and retries nested work", async () => {
    vi.useFakeTimers();
    const retry = { errors: ["States.TaskFailed"], intervalSeconds: 1, backoffRate: 2, maxAttempts: 1, maxDelaySeconds: 10, jitter: false };
    const child = definePipeline({
        ...leaf,
        states: { ...leaf.states, Work: { ...leaf.states.Work, retry, catches: { SupersededRunError: "Done" } } },
    });
    const definition = definePipeline({
        ...pipeline,
        states: { ...pipeline.states, Branches: { ...pipeline.states.Branches, branches: [child] } },
    });
    const queue: { body: string; delay: number }[] = [];
    const work = vi
        .fn<StageHandler<Input>>()
        .mockRejectedValueOnce(new Error("temporary"))
        .mockImplementation(async (value) => value);
    const publish = vi.fn<StageHandler<Input>>(async (value) => value);
    const failure = vi.fn<StageHandler<Input>>(async (value) => value);
    const runner = new ContinuationRunner(
        definition,
        { Work: work, Publish: publish, RecordFailure: failure },
        schema,
        async (body, delay) => {
            queue.push({ body, delay });
        },
        () => {},
    );
    await runner.start("retry", { id: "1", status: "ready" });
    while (queue.length > 0) {
        const item = queue.shift()!;
        vi.setSystemTime(Date.now() + item.delay * 1000);
        await runner.process(item.body);
    }
    expect(work.mock.calls.map(([, context]) => context.attempt)).toEqual([1, 2]);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(failure).not.toHaveBeenCalled();
    const superseded = new Error("stale");
    superseded.name = "SupersededRunError";
    work.mockRejectedValue(superseded);
    // Remove retries to exercise direct named routing.
    const direct = definePipeline({ ...child, states: { ...child.states, Work: { ...child.states.Work, retry: undefined } } });
    const directRunner = new ContinuationRunner(
        direct,
        { Work: work },
        schema,
        async (body) => {
            queue.push({ body, delay: 0 });
        },
        () => {},
    );
    await directRunner.start("stale", { id: "2" });
    while (queue.length > 0) await directRunner.process(queue.shift()!.body);
    expect(generateAsl(direct).States.Work).toMatchObject({
        Catch: [{ ErrorEquals: ["SupersededRunError"], Next: "Done", ResultPath: "$.failure" }],
    });
});
