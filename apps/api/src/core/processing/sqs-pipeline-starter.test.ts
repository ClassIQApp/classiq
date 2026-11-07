import { definePipeline } from "./pipeline.ts";
import { sqsPipelineStarter } from "./sqs-pipeline-starter.ts";
import { SQSClient } from "@aws-sdk/client-sqs";
import { expect, it, vi } from "vitest";

it("queues the injected definition's entry state and stable domain envelope", async () => {
    const client = new SQSClient({ region: "us-east-1", credentials: { accessKeyId: "test", secretAccessKey: "test" } });
    const send = vi.spyOn(client, "send").mockResolvedValue(undefined);
    const definition = definePipeline({ name: "fixture", startAt: "Start", states: { Start: { type: "succeed" } } });
    const deadline = new Date("2027-01-01T00:00:00Z");
    try {
        const start = sqsPipelineStarter(client, "http://local/queue", { resource: definition, lecture: definition });
        await start({
            pipeline: "resource",
            runId: "resource-1-run-1",
            input: { kind: "resource", courseId: "1", resourceId: "1" },
            deadline,
        });
        expect(send.mock.calls[0]![0].input).toEqual({
            QueueUrl: "http://local/queue",
            MessageBody: JSON.stringify({
                pipeline: "fixture",
                runId: "resource-1-run-1",
                input: { kind: "resource", courseId: "1", resourceId: "1" },
                state: "Start",
                attempt: 1,
                deadline: deadline.getTime(),
            }),
        });
    } finally {
        client.destroy();
    }
});
