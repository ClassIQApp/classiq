import { stepFunctionsPipelineStarter } from "./step-functions-pipeline-starter.ts";
import { SFNClient } from "@aws-sdk/client-sfn";
import { expect, it, vi } from "vitest";

it("starts Standard executions with a stable name and identical small envelope", async () => {
    const client = new SFNClient({ region: "us-east-1", credentials: { accessKeyId: "test", secretAccessKey: "test" } });
    const send = vi.spyOn(client, "send").mockResolvedValue(undefined);
    try {
        const start = stepFunctionsPipelineStarter(client, { lecture: "arn:lecture", resource: "arn:resource" });
        const request = {
            pipeline: "lecture" as const,
            runId: "lecture-42-run-1",
            input: { kind: "lecture" as const, courseId: "1", lectureId: "42" },
            deadline: new Date(),
        };
        await start(request);
        await start(request);
        expect(send.mock.calls[0]![0].input).toEqual({
            stateMachineArn: "arn:lecture",
            name: request.runId,
            input: JSON.stringify({ runId: request.runId, input: request.input }),
        });
        expect(send.mock.calls[1]![0].input).toEqual(send.mock.calls[0]![0].input);
    } finally {
        client.destroy();
    }
});
