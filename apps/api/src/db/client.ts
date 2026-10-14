import { Pool } from "pg";

export function createDatabase(databaseUrl: string): Pool {
    return new Pool({ connectionString: databaseUrl, max: 10 });
}
