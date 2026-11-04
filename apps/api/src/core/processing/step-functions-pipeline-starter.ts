import type { PipelineStarter } from "./processing-service.ts";
import { StartExecutionCommand, type SFNClient } from "@aws-sdk/client-sfn";

export function stepFunctionsPipelineStarter(
    client: SFNClient,
    machines: Readonly<Record<"lecture" | "resource", string>>,
): PipelineStarter {
    return async (request) => {
        await client.send(
            new StartExecutionCommand({
                stateMachineArn: machines[request.pipeline],
                name: request.runId,
                input: JSON.stringify({ runId: request.runId, input: request.input }),
            }),
        );
    };
}
