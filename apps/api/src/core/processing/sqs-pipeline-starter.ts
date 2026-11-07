import { encodeContinuation } from "./continuation-runner.ts";
import type { PipelineDefinition } from "./pipeline.ts";
import type { PipelineStart, PipelineStarter } from "./processing-service.ts";
import { SendMessageCommand, type SQSClient } from "@aws-sdk/client-sqs";

export function sqsPipelineStarter(
    client: SQSClient,
    queueUrl: string,
    pipelines: Readonly<Record<PipelineStart["pipeline"], PipelineDefinition>>,
): PipelineStarter {
    return async (request) => {
        const body = encodeContinuation({
            pipeline: pipelines[request.pipeline].name,
            runId: request.runId,
            input: request.input,
            state: pipelines[request.pipeline].startAt,
            attempt: 1,
            deadline: request.deadline.getTime(),
        });
        await client.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body }));
    };
}
