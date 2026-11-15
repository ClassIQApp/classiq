import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

interface Assertion {
    fullName: string;
    status: "passed" | "failed" | "skipped" | "pending" | "todo";
}

interface Report {
    testResults: { assertionResults: Assertion[] }[];
}

const FAILURE_SCENARIOS = /fail|retr|recover|duplicate|lost|supersed|permanent|resum|restart/i;

const { values } = parseArgs({ options: { out: { type: "string" } } });

const reportPath = path.join(mkdtempSync(path.join(tmpdir(), "eval-failures-")), "report.json");

const run = spawnSync("pnpm", ["exec", "vitest", "run", "src/core/processing", "--reporter=json", `--outputFile=${reportPath}`], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
});

if (run.error) {
    throw run.error;
}

const report = JSON.parse(readFileSync(reportPath, "utf8")) as Report;
const scenarios = report.testResults.flatMap((file) => file.assertionResults).filter((test) => FAILURE_SCENARIOS.test(test.fullName));

const table = [
    "| scenario | outcome |",
    "| --- | --- |",
    ...scenarios.map((scenario) => `| ${scenario.fullName.replaceAll("|", "/")} | ${scenario.status} |`),
    "",
    `${scenarios.filter((scenario) => scenario.status === "passed").length} passed, ${scenarios.filter((scenario) => scenario.status === "failed").length} failed, ${scenarios.filter((scenario) => scenario.status !== "passed" && scenario.status !== "failed").length} skipped of ${scenarios.length} failure scenarios`,
].join("\n");

if (values.out) {
    writeFileSync(path.resolve(values.out), `${table}\n`);
}

console.log(table);
