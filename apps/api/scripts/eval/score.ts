import { parseCsv, stringifyCsv } from "../../src/core/evaluation/csv.ts";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { results: { type: "string" }, port: { type: "string" } } });

if (!values.results) {
    throw new Error("Usage: eval:score --results <directory> [--port 4173]");
}

const scoringPath = path.resolve(values.results, "scoring.csv");
const page = readFileSync(path.resolve(import.meta.dirname, "score.html"), "utf8");
const [header = [], ...body] = parseCsv(readFileSync(scoringPath, "utf8"));
const rows = body.map((row) => header.map((_, column) => row[column] ?? ""));
const SCORE_COLUMNS = new Set([
    "correctness",
    "unsupported_claim",
    "correct_decline",
    "source_support",
    "single_correct",
    "key_ok",
    "explanation_ok",
    "duplicate",
    "supported",
    "notes",
]);

const asObject = (row: readonly string[]) => Object.fromEntries(header.map((name, column) => [name, row[column] ?? ""]));

function persist() {
    const temporary = `${scoringPath}.tmp`;

    writeFileSync(temporary, stringifyCsv([header, ...rows]));
    renameSync(temporary, scoringPath);
}

const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/api/items") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(rows.map((row) => asObject(row))));

        return;
    }

    if (request.method === "POST" && request.url === "/api/score") {
        const chunks: Buffer[] = [];

        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
            const { id, values: updates } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
                id: string;
                values: Record<string, string>;
            };
            const row = rows.find((candidate) => candidate[header.indexOf("id")] === id);
            const allowed = Object.keys(updates).every((name) => SCORE_COLUMNS.has(name));

            if (!row || !allowed) {
                response.writeHead(400).end("bad request");

                return;
            }

            for (const [name, value] of Object.entries(updates)) {
                row[header.indexOf(name)] = value;
            }
            persist();
            response.writeHead(204).end();
        });

        return;
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(page);
});

const port = Number(values.port ?? 4173);

server.listen(port, "127.0.0.1", () => {
    console.log(`Scoring ${rows.length} items from ${scoringPath}`);
    console.log(`Open http://127.0.0.1:${port}  (blind: this does not read key.csv)`);
});
