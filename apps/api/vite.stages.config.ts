import { defineConfig } from "vite";

export default defineConfig({
    envDir: false,
    ssr: { noExternal: true },
    build: {
        ssr: "src/stages.ts",
        target: "node24",
        minify: "oxc",
        sourcemap: true,
        emptyOutDir: false,
        rolldownOptions: { output: { entryFileNames: "stages.mjs", codeSplitting: false } },
    },
});
