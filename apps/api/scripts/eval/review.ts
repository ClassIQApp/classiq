import { stringifyCsv } from "../../src/core/evaluation/csv.ts";
import { buildIndex, search, type Passage, type PassageIndex } from "../../src/core/evaluation/passage-search.ts";
import { loadBenchmark, readJson } from "./benchmark-files.ts";
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import path from "node:path";
import { parseArgs } from "node:util";

interface Draft {
    id: string;
    category: string;
    question: string;
    reference_answer: string;
    where_the_answer_is: string;
    evidence: string;
    checks: string;
}

interface Review {
    status?: "approved" | "rejected";
    question?: string;
    reference_answer?: string;
    note?: string;
}

const { values } = parseArgs({
    options: { benchmark: { type: "string" }, drafts: { type: "string" }, csv: { type: "string" }, port: { type: "string" } },
});

if (!values.benchmark || !values.drafts || !values.csv) {
    throw new Error("Usage: eval:review --benchmark <benchmark.json> --drafts <directory> --csv <questions.csv> [--port 4174]");
}

const { benchmark, directory } = loadBenchmark(values.benchmark);
const draftsDirectory = path.resolve(values.drafts);
const csvPath = path.resolve(values.csv);
const statePath = path.join(draftsDirectory, "review-state.json");
const page = readFileSync(path.resolve(import.meta.dirname, "review.html"), "utf8");

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const WINDOW = 5;

interface LectureIndex {
    transcript: PassageIndex;
    documents: PassageIndex;
}

const indexes = new Map<string, LectureIndex>(
    benchmark.lectures.map((lecture) => {
        const segments = readJson(path.resolve(directory, lecture.transcript)) as { text: string; startSeconds: number }[];
        const transcriptPassages: Passage[] = Array.from({ length: Math.ceil(segments.length / WINDOW) }, (_, block) => {
            const slice = segments.slice(block * WINDOW, (block + 1) * WINDOW);

            return { label: `[${mmss(slice[0]!.startSeconds)}]`, text: slice.map((segment) => segment.text).join(" ") };
        });
        const documentPassages: Passage[] = lecture.documents.flatMap((document) =>
            (readJson(path.resolve(directory, document.pages)) as { text: string; pageNumber: number }[]).map((pageContent) => ({
                label: `${document.title}, page ${pageContent.pageNumber}`,
                text: pageContent.text.replaceAll(/\s+/g, " ").trim(),
            })),
        );

        return [lecture.id, { transcript: buildIndex(transcriptPassages), documents: buildIndex(documentPassages) }];
    }),
);

const lectureTitles = new Map(benchmark.lectures.map((lecture) => [lecture.id, lecture.title]));
const order = (id: string) => id.replace(/-([LDU])(\d)/, (_, kind: string, number: string) => `-${"LDU".indexOf(kind)}${number}`);
const drafts: Draft[] = readdirSync(draftsDirectory)
    .filter((file) => /^[A-Z]\d+\.json$/.test(file))
    .flatMap((file) => JSON.parse(readFileSync(path.join(draftsDirectory, file), "utf8")) as Draft[])
    .toSorted((first, second) => order(first.id).localeCompare(order(second.id)));
const crosscheck: Record<string, string> = existsSync(path.join(draftsDirectory, "crosscheck.json"))
    ? (JSON.parse(readFileSync(path.join(draftsDirectory, "crosscheck.json"), "utf8")) as Record<string, string>)
    : {};
const state: Record<string, Review> = existsSync(statePath) ? (JSON.parse(readFileSync(statePath, "utf8")) as Record<string, Review>) : {};

function atomicWrite(file: string, content: string) {
    writeFileSync(`${file}.tmp`, content);
    renameSync(`${file}.tmp`, file);
}

function writeCsv() {
    const rows = drafts.map((draft) => {
        const review = state[draft.id] ?? {};
        const approved = review.status === "approved";
        const edited =
            (review.question ?? draft.question) !== draft.question ||
            (review.reference_answer ?? draft.reference_answer) !== draft.reference_answer;

        return [
            draft.id,
            draft.id.split("-")[0]!,
            lectureTitles.get(draft.id.split("-")[0]!) ?? "",
            draft.category,
            approved ? (review.question ?? draft.question) : "",
            approved ? (review.reference_answer ?? draft.reference_answer) : "",
            approved ? draft.where_the_answer_is : "",
            review.status ?? "pending",
            edited ? "drafted by Claude, edited by Gavin" : "drafted by Claude",
        ];
    });

    atomicWrite(
        csvPath,
        stringifyCsv([
            ["id", "lecture", "lecture_title", "category", "question", "reference_answer", "where_the_answer_is", "status", "origin"],
            ...rows,
        ]),
    );
}

function evidence(lectureId: string, query: string) {
    const lecture = indexes.get(lectureId);

    return lecture
        ? { transcript: search(lecture.transcript, query, 3), documents: search(lecture.documents, query, 3) }
        : { transcript: [], documents: [] };
}

const json = (response: ServerResponse, body: unknown) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
};

const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "GET" && url.pathname === "/api/items") {
        json(response, {
            drafts: drafts.map((draft) => ({
                ...draft,
                lecture: draft.id.split("-")[0],
                review: state[draft.id] ?? {},
                crosscheck: crosscheck[draft.id] ?? "",
            })),
        });

        return;
    }

    if (request.method === "GET" && url.pathname === "/api/evidence") {
        const draft = drafts.find((candidate) => candidate.id === url.searchParams.get("id"));

        json(
            response,
            draft ? evidence(draft.id.split("-")[0]!, `${draft.question} ${draft.reference_answer}`) : { transcript: [], documents: [] },
        );

        return;
    }

    if (request.method === "GET" && url.pathname === "/api/search") {
        json(response, evidence(url.searchParams.get("lecture") ?? "", url.searchParams.get("q") ?? ""));

        return;
    }

    if (request.method === "POST" && url.pathname === "/api/review") {
        const chunks: Buffer[] = [];

        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
            const { id, patch } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { id: string; patch: Review };

            if (!drafts.some((draft) => draft.id === id)) {
                response.writeHead(400).end("unknown id");

                return;
            }

            state[id] = { ...state[id], ...patch };
            atomicWrite(statePath, `${JSON.stringify(state, null, 2)}\n`);
            writeCsv();
            response.writeHead(204).end();
        });

        return;
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(page);
});

writeCsv();

const port = Number(values.port ?? 4174);

server.listen(port, "127.0.0.1", () => {
    console.log(`${drafts.length} drafted questions; decisions are saved to ${statePath} and ${csvPath}`);
    console.log(`Open http://127.0.0.1:${port}`);
});
