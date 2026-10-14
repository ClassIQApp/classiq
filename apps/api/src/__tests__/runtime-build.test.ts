import { buildLambdaRuntime } from "../../scripts/runtime-build.ts";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const runFile = promisify(execFile);
const root = fileURLToPath(new URL("../..", import.meta.url));
const temporaryDirectories: string[] = [];

async function createTemporaryDirectory() {
    const directory = await mkdtemp(path.join(tmpdir(), "classiq-runtime-"));
    temporaryDirectories.push(directory);

    return directory;
}

async function buildInDirectory(directory: string, runtimeName: string, entry: string) {
    const archive = await buildLambdaRuntime({ root, entry, outDir: path.join(directory, runtimeName) });
    const extracted = path.join(directory, `${runtimeName}-extracted`);
    await runFile("unzip", ["-q", archive, "-d", extracted]);

    return { archive, extracted };
}

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Lambda runtime build", () => {
    it("packages the HTTP adapter with its executable handler", async () => {
        const directory = await createTemporaryDirectory();
        const { archive, extracted } = await buildInDirectory(directory, "http", "src/runtimes/http-lambda.ts");
        const { stdout } = await runFile("unzip", ["-Z1", archive]);

        expect(stdout.trim().split("\n").toSorted()).toEqual(["index.mjs", "index.mjs.map", "package.json"]);
        expect(JSON.parse(await readFile(path.join(extracted, "package.json"), "utf8"))).toEqual({ type: "module" });

        const script = `
            import { handler } from "./index.mjs";
            const response = await handler({
                version: "2.0",
                rawPath: "/",
                headers: { host: "example.com" },
                requestContext: { http: { method: "GET", path: "/" } },
                isBase64Encoded: false,
            });
            process.stdout.write(JSON.stringify(response));
        `;
        const executed = await runFile(process.execPath, ["--input-type=module", "--eval", script], { cwd: extracted });
        const response: { statusCode: number; body: string } = JSON.parse(executed.stdout);

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual({ message: "hello from node" });
    });

    it("builds a separate non-HTTP entrypoint that reuses domain code without Hono", async () => {
        const directory = await createTemporaryDirectory();
        const { archive: httpArchive } = await buildInDirectory(directory, "http", "src/runtimes/http-lambda.ts");
        const existingHttpArtifact = await readFile(httpArchive);
        const { extracted } = await buildInDirectory(directory, "worker", "src/__tests__/fixtures/worker.ts");

        expect(await readFile(httpArchive)).toEqual(existingHttpArtifact);
        const script = `
            import { handler } from "./index.mjs";
            process.stdout.write(JSON.stringify(await handler({ courseId: "missing-course" })));
        `;
        const executed = await runFile(process.execPath, ["--input-type=module", "--eval", script], { cwd: extracted });

        expect(JSON.parse(executed.stdout)).toEqual({ courseId: "missing-course", lectureCount: 0 });

        const sourceMap: { sources: string[] } = JSON.parse(await readFile(path.join(extracted, "index.mjs.map"), "utf8"));
        expect(sourceMap.sources.some((source) => source.includes("core/lecture/lecture-facade.ts"))).toBe(true);
        expect(sourceMap.sources.some((source) => source.includes("hono") || source.includes("runtimes/http-lambda"))).toBe(false);
    });
});
