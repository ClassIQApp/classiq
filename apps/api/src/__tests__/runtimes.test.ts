import { createDatabase } from "../db/client.ts";
import { readRuntimeConfig } from "../runtimes/config.ts";
import { createRuntimeDependencies } from "../runtimes/dependencies.ts";
import { describe, expect, it, vi } from "vitest";

const databaseUrl = "postgres://user:pass@localhost:5432/test";

describe("runtime dependencies", () => {
    it("reads configuration from the explicitly supplied environment", () => {
        expect(readRuntimeConfig({ DATABASE_URL: databaseUrl })).toEqual({ databaseUrl });
        expect(readRuntimeConfig({})).toEqual({ databaseUrl: undefined });
    });

    it("creates one lazy database pool per runtime, without sharing state", async () => {
        const factory = vi.fn(createDatabase);
        const first = createRuntimeDependencies({ databaseUrl }, factory);
        const second = createRuntimeDependencies({ databaseUrl }, factory);

        expect(factory).not.toHaveBeenCalled();

        const firstDatabase = first.getDb();
        const secondDatabase = second.getDb();

        try {
            expect(first.getDb()).toBe(firstDatabase);
            expect(second.getDb()).toBe(secondDatabase);
            expect(firstDatabase).not.toBe(secondDatabase);
            expect(factory).toHaveBeenCalledTimes(2);
            expect(factory).toHaveBeenNthCalledWith(1, databaseUrl);
            expect(factory).toHaveBeenNthCalledWith(2, databaseUrl);
        } finally {
            await Promise.all([firstDatabase.end(), secondDatabase.end()]);
        }
    });

    it("requires the database URL only when a runtime needs its database", () => {
        const factory = vi.fn(createDatabase);
        const dependencies = createRuntimeDependencies({}, factory);

        expect(factory).not.toHaveBeenCalled();
        expect(() => dependencies.getDb()).toThrow("DATABASE_URL is required");
        expect(factory).not.toHaveBeenCalled();
    });
});
