import { createApp } from "./app.ts";
import { awsProcessingStarter } from "./aws-processing.ts";
import { getDatabase } from "./db/client.ts";

export default createApp(getDatabase, {
    pipelineStarter:
        process.env.NODE_ENV === "production"
            ? awsProcessingStarter({
                  lecture: process.env.PROCESSING_LECTURE_MACHINE_ARN,
                  resource: process.env.PROCESSING_RESOURCE_MACHINE_ARN,
              })
            : undefined,
});
