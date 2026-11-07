import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("refuses the fixture worker in production even with the local emulator configuration", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../../pipeline-dev.ts", import.meta.url))], {
        cwd: fileURLToPath(new URL("../../../", import.meta.url)),
        env: {
            ...process.env,
            NODE_ENV: "production",
            PROCESSING_FIXTURES: "1",
            DATABASE_URL: "postgres://classiq:classiq@localhost:5432/classiq",
            SQS_ENDPOINT: "http://localhost:9324",
            SQS_QUEUE_URL: "http://localhost:9324/000000000000/classiq-local",
            S3_ENDPOINT: "http://localhost:9100",
            COURSE_RESOURCE_FILES_BUCKET_NAME: "classiq-local-files",
        },
        encoding: "utf8",
        timeout: 10_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("pipeline:dev requires the default local emulators and a local database.");
    expect(result.stdout).not.toContain("fixture mode");
});
