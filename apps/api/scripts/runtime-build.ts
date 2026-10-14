import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { build } from "vite";

const runFile = promisify(execFile);

export interface LambdaRuntimeBuild {
    readonly root: string;
    readonly entry: string;
    readonly outDir: string;
}

export async function buildLambdaRuntime({ root, entry, outDir }: LambdaRuntimeBuild): Promise<string> {
    const directory = path.resolve(root, outDir);

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
            ssr: path.resolve(root, entry),
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

    return path.resolve(directory, "lambda.zip");
}
