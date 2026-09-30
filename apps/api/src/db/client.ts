import { Pool } from "pg";

export function createDatabase(databaseUrl: string): Pool {
    return new Pool({ connectionString: databaseUrl, max: 10 });
}

let database: Pool | undefined;

export function getDatabase(): Pool {
    if (!database) {
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) {
            throw new Error("DATABASE_URL is required");
        }

        database = createDatabase(databaseUrl);
    }

    return database;
}
