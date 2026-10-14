import { createDatabase } from "../db/client.ts";
import type { RuntimeConfig } from "./config.ts";
import type { Pool } from "pg";

export interface RuntimeDependencies {
    readonly getDb: () => Pool;
}

export function createRuntimeDependencies(
    config: RuntimeConfig,
    databaseFactory: (databaseUrl: string) => Pool = createDatabase,
): RuntimeDependencies {
    let database: Pool | undefined;

    return {
        getDb() {
            if (!database) {
                if (!config.databaseUrl) {
                    throw new Error("DATABASE_URL is required");
                }

                database = databaseFactory(config.databaseUrl);
            }

            return database;
        },
    };
}
