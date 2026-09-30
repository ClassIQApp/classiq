import { createDatabase } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
}

const db = createDatabase(databaseUrl);

try {
    const applied = await runMigrations(db);

    console.log(applied.length > 0 ? `Applied:\n${applied.map((name) => `  ${name}`).join("\n")}` : "Up to date");
} finally {
    await db.end();
}
