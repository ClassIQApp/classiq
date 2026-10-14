import devServer from "@hono/vite-dev-server";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [
        devServer({
            entry: "src/runtimes/local.ts",
            injectClientScript: false,
        }),
    ],
    server: {
        port: 3000,
    },
    ssr: {
        noExternal: ["hono"],
    },
});
