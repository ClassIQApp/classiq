import type { PipelineStarter } from "./core/processing/processing-service.ts";
import { stepFunctionsPipelineStarter } from "./core/processing/step-functions-pipeline-starter.ts";
import { SFNClient } from "@aws-sdk/client-sfn";

interface ProcessingMachines {
    lecture?: string;
    resource?: string;
}

export function awsProcessingStarter(machines: Readonly<ProcessingMachines>): PipelineStarter {
    return async (request) => {
        const { lecture, resource } = machines;
        if (!lecture || !resource) throw new Error("Processing state machines are not configured.");
        const client = new SFNClient({});
        try {
            await stepFunctionsPipelineStarter(client, { lecture, resource })(request);
        } finally {
            client.destroy();
        }
    };
}
