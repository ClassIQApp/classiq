import { buildLambdaRuntime } from "./runtime-build.ts";
import { lambdaRuntimes } from "./runtimes.ts";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const requested = process.argv.slice(2);
const names = requested.length > 0 ? requested : Object.keys(lambdaRuntimes);

for (const name of names) {
    const entry = lambdaRuntimes[name];
    if (!entry) {
        throw new Error(`Unknown Lambda runtime "${name}". Available: ${Object.keys(lambdaRuntimes).join(", ")}`);
    }

    await buildLambdaRuntime({ root, entry, outDir: `dist/${name}` });
}
