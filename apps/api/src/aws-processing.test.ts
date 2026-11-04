import { createApp } from "./app.ts";
import { awsProcessingStarter } from "./aws-processing.ts";
import { SFNClient } from "@aws-sdk/client-sfn";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./app.ts", async () => {
    const { Hono } = await import("hono");

    return { createApp: vi.fn(() => new Hono()) };
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.mocked(createApp).mockClear();
});

const lecture = "arn:aws:states:us-east-1:123456789012:stateMachine:lecture";
const resource = "arn:aws:states:us-east-1:123456789012:stateMachine:resource";
const request = {
    pipeline: "lecture" as const,
    runId: "persisted-run-1",
    input: { kind: "lecture" as const, courseId: "1", lectureId: "2" },
    deadline: new Date(),
};

it.each(["./index.ts", "./lambda.ts"])("%s injects the AWS starter at the production API boundary", async (entrypoint) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PROCESSING_LECTURE_MACHINE_ARN", lecture);
    vi.stubEnv("PROCESSING_RESOURCE_MACHINE_ARN", resource);
    const send = vi.spyOn(SFNClient.prototype, "send").mockResolvedValue(undefined);
    const destroy = vi.spyOn(SFNClient.prototype, "destroy");
    await import(entrypoint);
    const starter = vi.mocked(createApp).mock.calls.at(-1)![1]!.pipelineStarter!;
    expect(starter).toBeTypeOf("function");
    await starter(request);
    await starter({ ...request, pipeline: "resource", input: { kind: "resource", courseId: "1", resourceId: "3" } });
    expect(send.mock.calls.map(([command]) => command.input)).toEqual([
        { stateMachineArn: lecture, name: request.runId, input: JSON.stringify({ runId: request.runId, input: request.input }) },
        {
            stateMachineArn: resource,
            name: request.runId,
            input: JSON.stringify({ runId: request.runId, input: { kind: "resource", courseId: "1", resourceId: "3" } }),
        },
    ]);
    expect(destroy).toHaveBeenCalledTimes(2);
});

it("rejects missing machine configuration without an AWS call", async () => {
    const send = vi.spyOn(SFNClient.prototype, "send").mockResolvedValue(undefined);
    for (const environment of [{}, { lecture }, { resource }]) {
        await expect(awsProcessingStarter(environment)(request)).rejects.toThrow("Processing state machines are not configured.");
    }
    expect(send).not.toHaveBeenCalled();
});

it("releases its client when dispatch fails", async () => {
    vi.spyOn(SFNClient.prototype, "send").mockRejectedValue(new Error("dispatch failed"));
    const destroy = vi.spyOn(SFNClient.prototype, "destroy");
    await expect(awsProcessingStarter({ lecture, resource })(request)).rejects.toThrow("dispatch failed");
    expect(destroy).toHaveBeenCalledOnce();
});

it("keeps the explicitly local development starter available", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await import("./index.ts");
    expect(vi.mocked(createApp).mock.calls.at(-1)![1]!.pipelineStarter).toBeUndefined();
});
