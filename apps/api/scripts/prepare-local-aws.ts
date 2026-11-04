import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

// Never let local provisioning fall back to AWS, even with an AWS profile in the shell.
if (process.env.S3_ENDPOINT !== "http://localhost:9100" || process.env.COURSE_RESOURCE_FILES_BUCKET_NAME !== "classiq-local-files") {
    throw new Error("Local provisioning requires the default local S3 endpoint and bucket.");
}

const client = new S3Client({
    region: "us-east-1",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: "classiq", secretAccessKey: "classiq-local" },
});
const Bucket = process.env.COURSE_RESOURCE_FILES_BUCKET_NAME;

try {
    try {
        await client.send(new HeadBucketCommand({ Bucket }));
    } catch (error) {
        if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) {
            throw error;
        }

        await client.send(new CreateBucketCommand({ Bucket }));
    }

    // Compose waits for MinIO's healthcheck; ElasticMQ needs a separate readiness check.
    for (const queueName of ["classiq-local", "classiq-local-dead-letters"]) {
        for (const attempt of Array.from({ length: 30 }, (_, index) => index)) {
            try {
                const response = await fetch("http://localhost:9324", {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: `Action=GetQueueUrl&QueueName=${queueName}&Version=2012-11-05`,
                    signal: AbortSignal.timeout(2000),
                });

                if (!response.ok) {
                    throw new Error(`ElasticMQ returned ${response.status}`);
                }

                break;
            } catch (error) {
                if (attempt >= 29) {
                    throw error;
                }

                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
    }

    console.log("Local S3 bucket and SQS queues are ready.");
} finally {
    client.destroy();
}
