import { readAuthConfig } from "./config.ts";
import { describe, expect, it } from "vitest";

const environment = {
    BETTER_AUTH_SECRET: "classiq-config-tests-only-secret-123456789",
    BETTER_AUTH_URL: "http://127.0.0.1:3000",
    AUTH_TRUSTED_ORIGINS: "http://127.0.0.1:5173,http://localhost:5173",
};

describe("auth runtime configuration", () => {
    it("requires an explicit secret, API URL and origin list", () => {
        expect(() => readAuthConfig({})).toThrow("BETTER_AUTH_SECRET");
        expect(() => readAuthConfig({ ...environment, BETTER_AUTH_SECRET: "short" })).toThrow("BETTER_AUTH_SECRET");
        expect(() => readAuthConfig({ ...environment, BETTER_AUTH_URL: undefined })).toThrow("BETTER_AUTH_URL");
        expect(() => readAuthConfig({ ...environment, AUTH_TRUSTED_ORIGINS: undefined })).toThrow("AUTH_TRUSTED_ORIGINS");
    });

    it("allows only exact HTTP origins", () => {
        for (const origin of [
            "*",
            "https://*.example.com",
            "null",
            "https://example.com/path",
            "https://user:pass@example.com",
            "ftp://example.com",
            "",
        ]) {
            expect(() => readAuthConfig({ ...environment, AUTH_TRUSTED_ORIGINS: origin })).toThrow();
        }

        expect(readAuthConfig(environment).trustedOrigins).toEqual(["http://127.0.0.1:5173", "http://localhost:5173"]);
    });

    it("requires HTTPS for the API and trusted origins in production", () => {
        expect(() => readAuthConfig({ ...environment, NODE_ENV: "production" })).toThrow();
        expect(() => readAuthConfig({ ...environment, NODE_ENV: "production", BETTER_AUTH_URL: "https://api.example.com" })).toThrow();
        expect(
            readAuthConfig({
                ...environment,
                NODE_ENV: "production",
                BETTER_AUTH_URL: "https://api.example.com",
                AUTH_TRUSTED_ORIGINS: "https://example.com",
            }).production,
        ).toBe(true);
    });
});
