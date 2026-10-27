import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

let server: ViteDevServer | undefined;

let baseURL: string;

const origin = "http://localhost:5173";

beforeAll(async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "dev-server-cors-regression-test-only-secret");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("AUTH_TRUSTED_ORIGINS", origin);

    server = await createServer({
        configFile: fileURLToPath(new URL("../../../vite.config.ts", import.meta.url)),
        root: fileURLToPath(new URL("../../..", import.meta.url)),
        server: { host: "127.0.0.1", port: 0 },
        logLevel: "silent",
    });

    await server.listen();

    const address = server.httpServer?.address();

    if (!address || typeof address === "string") {
        throw new Error("Expected a local HTTP server");
    }

    baseURL = `http://127.0.0.1:${address.port}`;
}, 20_000);

afterAll(async () => {
    await server?.close();

    vi.unstubAllEnvs();
});

it("lets Hono answer credentialed preflight through the actual Vite server", async () => {
    for (const requestOrigin of [origin, "https://untrusted.example"]) {
        const response = await fetch(`${baseURL}/api/auth/sign-up/email`, {
            method: "OPTIONS",
            headers: {
                Origin: requestOrigin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type",
            },
        });

        expect(response.status).toBe(204);
        expect(response.headers.get("access-control-allow-origin")).toBe(requestOrigin === origin ? origin : null);

        if (requestOrigin === origin) {
            expect(response.headers.get("access-control-allow-credentials")).toBe("true");
            expect(response.headers.get("access-control-allow-methods")).toContain("POST");
            expect(response.headers.get("access-control-allow-headers")).toMatch(/content-type/i);
        }
    }
});
