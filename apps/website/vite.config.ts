import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
    envDir: false,
    plugins: [react()],
    server: {
        port: 5173,
        strictPort: true,
        proxy: {
            // Keep cookies on the browser's host, whether opened via localhost or 127.0.0.1.
            "/_api": {
                target: "http://127.0.0.1:3000",
                rewrite: (path) => path.replace(/^\/_api/, ""),
            },
        },
    },
});
