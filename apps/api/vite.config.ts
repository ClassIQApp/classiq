import devServer from "@hono/vite-dev-server";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [
        devServer({
            entry: "src/index.ts",
            injectClientScript: false,
        }),
    ],
    server: {
        port: 3000,
    },
    ssr: {
        noExternal: ["hono"],
    },
    build: {
        ssr: "src/lambda.ts",
        target: "node24",
        minify: "oxc",
        sourcemap: true,
        rolldownOptions: {
            output: {
                entryFileNames: "index.mjs",
            },
        },
    },
});
