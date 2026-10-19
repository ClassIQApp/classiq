import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build } from "vite";

const entrypoints = [{ name: "http", entry: "src/lambda.ts" }] satisfies { name: string; entry: string }[];
const root = fileURLToPath(new URL("..", import.meta.url));
const runFile = promisify(execFile);
const requestedNames = process.argv.slice(2);
const names = requestedNames.length > 0 ? requestedNames : entrypoints.map(({ name }) => name);
const selectedEntrypoints = names.map((name) => {
    const entrypoint = entrypoints.find((entrypoint) => entrypoint.name === name);
    if (!entrypoint) {
        throw new Error(`Unknown Lambda entrypoint "${name}"`);
    }

    return entrypoint;
});

for (const { name, entry } of selectedEntrypoints) {
    const directory = path.join(root, "dist", name);

    await build({
        configFile: false,
        root,
        plugins: [
            {
                name: "lambda-package",
                generateBundle() {
                    this.emitFile({ type: "asset", fileName: "package.json", source: JSON.stringify({ type: "module" }) });
                },
            },
        ],
        ssr: { noExternal: true },
        build: {
            ssr: path.join(root, entry),
            outDir: directory,
            emptyOutDir: true,
            target: "node24",
            minify: "oxc",
            sourcemap: true,
            rolldownOptions: {
                output: {
                    entryFileNames: "index.mjs",
                    codeSplitting: false,
                },
            },
        },
    });

    await runFile("zip", ["-q", "-X", "lambda.zip", "package.json", "index.mjs", "index.mjs.map"], { cwd: directory });
}
