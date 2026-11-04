import { generateAsl } from "../src/core/processing/asl.ts";
import { lecturePipeline } from "../src/core/processing/lecture-pipeline.ts";
import { resourcePipeline } from "../src/core/processing/resource-pipeline.ts";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";

const directory = await mkdtemp(path.join(tmpdir(), "classiq-asl-validation-"));
try {
    for (const pipeline of [lecturePipeline, resourcePipeline]) {
        const definition = JSON.stringify(generateAsl(pipeline)).replaceAll(
            /\$\{\w+FunctionArn\}/g,
            "arn:aws:lambda:us-east-1:000000000000:function:validation-only",
        );
        const file = path.join(directory, `${pipeline.name}.json`);
        await writeFile(file, definition);
        const result = z
            .object({
                result: z.enum(["OK", "FAIL"]),
                diagnostics: z.array(
                    z.object({ severity: z.string(), code: z.string(), message: z.string(), location: z.string().optional() }),
                ),
                truncated: z.boolean(),
            })
            .parse(
                JSON.parse(
                    execFileSync(
                        "aws",
                        [
                            "stepfunctions",
                            "validate-state-machine-definition",
                            "--definition",
                            `file://${file}`,
                            "--type",
                            "STANDARD",
                            "--severity",
                            "WARNING",
                            "--region",
                            process.env.AWS_REGION ?? "us-east-1",
                            "--output",
                            "json",
                        ],
                        { encoding: "utf8" },
                    ),
                ),
            );
        console.log(JSON.stringify({ pipeline: pipeline.name, ...result }));
        if (result.result !== "OK" || result.diagnostics.length > 0 || result.truncated)
            throw new Error(`${pipeline.name} ASL validation did not pass cleanly.`);
    }
} finally {
    await rm(directory, { recursive: true, force: true });
}
