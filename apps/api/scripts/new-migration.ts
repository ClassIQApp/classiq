import { migrationsDirectory } from "../src/db/migrate.ts";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const name = process.argv[2]?.trim().replaceAll(/\W+/g, "_").toLowerCase();

if (!name) {
    throw new Error("Usage: pnpm run db:new <migration_name>");
}

const timestamp = new Date().toISOString().replaceAll(/\D/g, "").slice(0, 14);
const file = path.join(migrationsDirectory, `${timestamp}_${name}.sql`);

await writeFile(file, "", { flag: "wx" });
console.log(`Created ${file}`);
