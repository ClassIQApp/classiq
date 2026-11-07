import { generateAsl } from "./asl.ts";
import { ContinuationRunner, type Transition } from "./continuation-runner.ts";
import { lambdaStageHandler, readFailure } from "./lambda-stage-handler.ts";
import { definePipeline, PermanentStageError, RetryableStageError, transient, type StageHandler } from "./pipeline.ts";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";

const input = z.object({ id: z.string() });
type Input = z.infer<typeof input>;
const retry = { ...transient, intervalSeconds: 2, maxAttempts: 2, jitter: false };
const pipeline = definePipeline({
    name: "test",
    startAt: "Work",
    catch: "RecordFailure",
    states: {
        Work: { type: "task", next: "Pause", timeoutSeconds: 60, retry },
        Pause: { type: "wait", next: "Done", seconds: 1801 },
        RecordFailure: { type: "task", next: "Failed", timeoutSeconds: 60 },
        Failed: { type: "fail" },
        Done: { type: "succeed" },
    },
});

function fixture(work: StageHandler<Input>) {
    const queue: { body: string; delay: number }[] = [];
    const transitions: Transition[] = [];
    const recordFailure = vi.fn<StageHandler<Input>>(async (value) => value);
    const enqueue = vi.fn(async (body: string, delay: number) => {
        queue.push({ body, delay });
    });
    const runner = new ContinuationRunner(pipeline, { Work: work, RecordFailure: recordFailure }, input, enqueue, (transition) => {
        transitions.push(transition);
    });

    return { runner, queue, transitions, recordFailure, enqueue };
}

afterEach(() => vi.useRealTimers());

it("compiles the same transitions, retries, timeout and catch used by the local runner", async () => {
    const asl = generateAsl(pipeline);
    expect(asl.StartAt).toBe(pipeline.startAt);
    expect(Object.keys(asl.States)).toEqual(Object.keys(pipeline.states));
    expect(asl.States.Work).toMatchObject({
        Next: "Pause",
        TimeoutSeconds: 60,
        OutputPath: "$.Payload",
        Parameters: {
            FunctionName: "${WorkFunctionArn}",
            Payload: { "envelope.$": "$", "retryCount.$": "$$.State.RetryCount", timeoutSeconds: 60 },
        },
        Retry: [
            { ErrorEquals: retry.errors, IntervalSeconds: 2, BackoffRate: 2, MaxAttempts: 2, MaxDelaySeconds: 300, JitterStrategy: "NONE" },
        ],
        Catch: [{ ErrorEquals: ["States.ALL"], ResultPath: "$.failure", Next: "RecordFailure" }],
    });
    expect(asl.States.RecordFailure).not.toHaveProperty("Catch");
    expect(asl.States.Pause).toEqual({ Type: "Wait", Seconds: 1801, Next: "Done" });
    expect(asl.States.Done).toMatchObject({ Type: "Succeed" });
    expect(asl.States.Failed).toMatchObject({ Type: "Fail" });

    vi.useFakeTimers();
    const f = fixture(async (value) => value);
    await f.runner.start("run", { id: "1" });
    await f.runner.process(f.queue.shift()!.body);
    await f.runner.process(f.queue.shift()!.body);
    expect(f.queue[0]?.delay).toBe(900);
    for (const seconds of [900, 900, 1]) {
        vi.setSystemTime(Date.now() + seconds * 1000);
        await f.runner.process(f.queue.shift()!.body);
    }
    expect(f.queue).toHaveLength(0);
    expect(f.transitions.at(-1)?.outcome).toBe("succeeded");
});

it("retries twice, then catches with the same safe failure and attempt count as Lambda", async () => {
    vi.useFakeTimers();
    const handler = vi.fn<StageHandler<Input>>(async () => {
        throw new RetryableStageError("TEMPORARY", "Please try again.");
    });
    const f = fixture(handler);
    await f.runner.start("run", { id: "1" });
    await f.runner.process(f.queue.shift()!.body);
    expect(f.queue[0]?.delay).toBe(2);
    vi.setSystemTime(Date.now() + 2000);
    await f.runner.process(f.queue.shift()!.body);
    expect(f.queue[0]?.delay).toBe(4);
    vi.setSystemTime(Date.now() + 4000);
    await f.runner.process(f.queue.shift()!.body);
    await f.runner.process(f.queue.shift()!.body);
    expect(handler.mock.calls.map((call) => call[1].attempt)).toEqual([1, 2, 3]);
    expect(f.recordFailure.mock.calls[0]?.[1].failure).toEqual({ code: "TEMPORARY", message: "Please try again." });
    await f.runner.process(f.queue.shift()!.body);
    expect(f.transitions.at(-1)?.outcome).toBe("failed");

    const lambda = lambdaStageHandler(handler, input);
    let thrown: unknown;
    try {
        await lambda(
            { envelope: { runId: "run", input: { id: "1" } }, retryCount: 2, timeoutSeconds: 60 },
            { getRemainingTimeInMillis: () => 1000 },
        );
    } catch (error) {
        thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).name).toBe("RetryableStageError");
    expect(readFailure({ Error: "RetryableStageError", Cause: JSON.stringify({ errorMessage: (thrown as Error).message }) })).toEqual(
        f.recordFailure.mock.calls[0]?.[1].failure,
    );
});

it("does not retry permanent errors, swallow queue failures, or accept oversized state", async () => {
    const permanent = fixture(async () => {
        throw new PermanentStageError("BAD_INPUT", "Upload again.");
    });
    await permanent.runner.start("run", { id: "1" });
    await permanent.runner.process(permanent.queue.shift()!.body);
    expect(JSON.parse(permanent.queue[0]!.body).state).toBe("RecordFailure");

    const f = fixture(async (value) => value);
    await f.runner.start("run", { id: "1" });
    f.enqueue.mockRejectedValueOnce(new Error("queue unavailable"));
    await expect(f.runner.process(f.queue.shift()!.body)).rejects.toThrow("queue unavailable");
    expect(f.recordFailure).not.toHaveBeenCalled();
    await expect(f.runner.start("large", { id: "é".repeat(140_000) })).rejects.toThrow("256 KiB");
    expect(() => definePipeline({ name: "bad", startAt: "missing", states: {} })).toThrow("existing states");
});

it("recovers after a transient failure and routes a task timeout without exposing raw errors", async () => {
    vi.useFakeTimers();
    const work = vi
        .fn<StageHandler<Input>>()
        .mockRejectedValueOnce(new RetryableStageError("TEMPORARY", "Try again."))
        .mockImplementation(async (value) => value);
    const recovered = fixture(work);
    await recovered.runner.start("run", { id: "1" });
    await recovered.runner.process(recovered.queue.shift()!.body);
    vi.setSystemTime(Date.now() + 2000);
    await recovered.runner.process(recovered.queue.shift()!.body);
    expect(JSON.parse(recovered.queue[0]!.body).state).toBe("Pause");
    expect(recovered.recordFailure).not.toHaveBeenCalled();

    const hanging = fixture(() => new Promise(() => {}));
    await hanging.runner.start("run", { id: "1" });
    const processing = hanging.runner.process(hanging.queue.shift()!.body);
    await vi.advanceTimersByTimeAsync(60_000);
    await processing;
    await hanging.runner.process(hanging.queue.shift()!.body);
    expect(hanging.recordFailure.mock.calls[0]?.[1].failure?.code).toBe("PROCESSING_FAILED");
    expect(readFailure({ Error: "Error", Cause: JSON.stringify({ code: "PROVIDER", message: "secret connection details" }) })).toEqual({
        code: "PROCESSING_FAILED",
        message: "Processing failed. Try again.",
    });
});
