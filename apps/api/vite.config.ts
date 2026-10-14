import devServer from "@hono/vite-dev-server";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
    plugins: [
        devServer({
            entry: "src/index.ts",
            injectClientScript: false,
        }),
        {
            name: "lambda-package",
            generateBundle() {
                this.emitFile({ type: "asset", fileName: "package.json", source: JSON.stringify({ type: "module" }) });
            },
        },
    ],
    server: {
        port: 3000,
    },
    ssr: {
        noExternal: command === "build" ? true : ["hono"],
    },
    build: {
        ssr: "src/lambda.ts",
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
}));
