import { Pool } from "pg";

export function createDatabase(databaseUrl: string): Pool {
    return new Pool({ connectionString: databaseUrl, max: 10 });
}

export function createDatabaseGetter(databaseUrl: string | undefined): () => Pool {
    let database: Pool | undefined;

    return () => {
        if (!database) {
            if (!databaseUrl) {
                throw new Error("DATABASE_URL is required");
            }

            database = createDatabase(databaseUrl);
        }

        return database;
    };
}
