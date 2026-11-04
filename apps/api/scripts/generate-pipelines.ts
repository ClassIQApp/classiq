import { generateAsl } from "../src/core/processing/asl.ts";
import { lecturePipeline } from "../src/core/processing/lecture-pipeline.ts";
import type { PipelineDefinition } from "../src/core/processing/pipeline.ts";
import { resourcePipeline } from "../src/core/processing/resource-pipeline.ts";
import { mkdir, writeFile } from "node:fs/promises";

await mkdir("dist/pipelines", { recursive: true });
for (const pipeline of [lecturePipeline, resourcePipeline]) {
    const tasks = new Map<string, { handler: string; timeoutSeconds: number }>();
    function collect(definition: PipelineDefinition) {
        for (const [name, state] of Object.entries(definition.states)) {
            if (state.type === "task") {
                const task = { handler: `stages.${pipeline.name}${name}`, timeoutSeconds: state.timeoutSeconds };
                if (tasks.has(name) && tasks.get(name)!.timeoutSeconds !== task.timeoutSeconds) {
                    throw new Error(`Conflicting task definition: ${name}`);
                }
                tasks.set(name, task);
            }
            if (state.type === "map") collect(state.iterator);
            if (state.type === "parallel") {
                for (const branch of state.branches) collect(branch);
            }
        }
    }
    collect(pipeline);
    await writeFile(`dist/pipelines/${pipeline.name}.asl.json`, JSON.stringify(generateAsl(pipeline), null, 2) + "\n");
    await writeFile(`dist/pipelines/${pipeline.name}.tasks.json`, JSON.stringify(Object.fromEntries(tasks), null, 2) + "\n");
}
