import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

export const migrationsDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../db/migrations");

const MIGRATION_LOCK_ID = 727_001;

interface AppliedMigration {
    name: string;
    checksum: string;
}

export async function runMigrations(db: Pool, directory = migrationsDirectory): Promise<string[]> {
    const entries = await readdir(directory);
    const files = entries.filter((file) => file.endsWith(".sql")).toSorted();
    const applied: string[] = [];

    const client = await db.connect();

    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK_ID]);
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name TEXT PRIMARY KEY,
                checksum TEXT NOT NULL,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        `);

        const history = await client.query<AppliedMigration>("SELECT name, checksum FROM schema_migrations");
        const checksums = new Map(history.rows.map((row) => [row.name, row.checksum]));

        for (const file of files) {
            const sql = await readFile(path.join(directory, file), "utf8");
            const checksum = createHash("sha256").update(sql).digest("hex");
            const recorded = checksums.get(file);

            if (recorded !== undefined) {
                if (recorded !== checksum) {
                    throw new Error(`Migration ${file} was modified after being applied`);
                }
                continue;
            }

            await client.query(sql);
            await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [file, checksum]);
            applied.push(file);
        }

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    return applied;
}
