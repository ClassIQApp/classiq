import { createApp } from "./app.ts";
import { awsProcessingStarter } from "./aws-processing.ts";
import { readAuthConfig } from "./core/auth/config.ts";
import { getDatabase } from "./db/client.ts";
import { handle } from "hono/aws-lambda";

const app = createApp(getDatabase, {
    pipelineStarter: awsProcessingStarter({
        lecture: process.env.PROCESSING_LECTURE_MACHINE_ARN,
        resource: process.env.PROCESSING_RESOURCE_MACHINE_ARN,
    }),
    getAuthConfig: () => readAuthConfig({ ...process.env, NODE_ENV: "production" }),
});

export const handler = handle(app);
