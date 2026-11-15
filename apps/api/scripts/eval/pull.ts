import { groupBy } from "../../src/core/evaluation/analysis.ts";
import { benchmarkSchema } from "../../src/core/evaluation/benchmark.ts";
import { joinOverlappingChunks } from "../../src/core/evaluation/page-text.ts";
import { transcriptSchema } from "../../src/core/transcript/model.ts";
import { createDatabase } from "../../src/db/client.ts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
    options: {
        out: { type: "string" },
        course: { type: "string" },
        lecture: { type: "string" },
        id: { type: "string" },
        topic: { type: "string" },
        resource: { type: "string", multiple: true },
        excerpt: { type: "string" },
    },
});

const databaseUrl = process.env.SOURCE_DATABASE_URL;

if (!databaseUrl || !values.out || !values.course || !values.lecture || !values.id || !values.topic) {
    throw new Error(
        "Usage: SOURCE_DATABASE_URL=<url> eval:pull --out <directory> --course <courseId> --lecture <lectureId> --id <L1> --topic <topic> [--resource <resourceId> ...] [--excerpt <startSeconds>-<endSeconds>]",
    );
}

const excerpt = values.excerpt?.match(/^(\d+)-(\d+)$/);

if (values.excerpt && !excerpt) {
    throw new Error("--excerpt must look like 600-750 (seconds)");
}

const slug = (text: string) =>
    text
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-")
        .replaceAll(/^-|-$/g, "");
const lectureId = values.id;
const outDirectory = path.resolve(values.out);
const write = (file: string, content: unknown) => {
    const target = path.resolve(outDirectory, file);

    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`);
};

const db = createDatabase(databaseUrl);

async function pull() {
    const lecture = await db.query<{ title: string }>("SELECT title FROM lectures WHERE fk_course_id = $1 AND id = $2", [
        values.course,
        values.lecture,
    ]);
    const stored = await db.query<{ content: unknown }>(
        "SELECT content FROM lecture_transcripts WHERE course_id = $1 AND lecture_id = $2",
        [values.course, values.lecture],
    );

    if (lecture.rows.length === 0 || stored.rows.length === 0) {
        throw new Error(`Lecture ${values.course}/${values.lecture} was not found or has no transcript`);
    }

    const transcript = transcriptSchema.parse(stored.rows[0]!.content);
    const segments = transcript.segments.map(({ text, startSeconds, endSeconds }) => ({ text, startSeconds, endSeconds }));
    const resources = await db.query<{ id: number; name: string }>(
        `SELECT r.id, r.name FROM course_resources r
         JOIN content_sources s ON s.resource_id = r.id AND s.status = 'indexed'
         WHERE r.fk_course_id = $1 AND ($2::int[] IS NULL OR r.id = ANY($2))
         ORDER BY r.id`,
        [values.course, values.resource ? values.resource.map(Number) : null],
    );

    const documents = await Promise.all(
        resources.rows.map(async (resource) => {
            const chunks = await db.query<{ page_number: number; position: number; content: string }>(
                `SELECT c.page_number, c.position, c.content FROM content_chunks c
                 JOIN content_sources s ON s.id = c.source_id
                 WHERE s.resource_id = $1 AND c.page_number IS NOT NULL
                 ORDER BY c.page_number, c.position`,
                [resource.id],
            );
            const pages = [...groupBy(chunks.rows, (chunk) => String(chunk.page_number)).entries()].map(([pageNumber, pageChunks]) => ({
                text: joinOverlappingChunks(pageChunks.map((chunk) => chunk.content)),
                pageNumber: Number(pageNumber),
            }));
            const file = `documents/${lectureId}-${slug(resource.name)}-${resource.id}.json`;

            write(file, pages);

            return { title: resource.name, pages: file, pageCount: pages.length };
        }),
    );

    const transcriptFile = `transcripts/${lectureId}.json`;

    write(transcriptFile, segments);

    const wer = excerpt
        ? { reference: `wer/${lectureId}.txt`, startSeconds: Number(excerpt[1]), endSeconds: Number(excerpt[2]) }
        : undefined;

    if (wer) {
        write(
            `wer/${lectureId}.machine.txt`,
            `${segments
                .filter((segment) => segment.startSeconds >= wer.startSeconds && segment.endSeconds <= wer.endSeconds)
                .map((segment) => segment.text)
                .join(" ")}\n`,
        );
    }

    const benchmarkFile = path.resolve(outDirectory, "benchmark.json");
    const existing = existsSync(benchmarkFile) ? benchmarkSchema.parse(JSON.parse(readFileSync(benchmarkFile, "utf8"))) : undefined;
    const entry = {
        id: lectureId,
        title: lecture.rows[0]!.title,
        topic: values.topic!,
        transcript: transcriptFile,
        documents: documents.map(({ title, pages }) => ({ title, pages })),
        ...(wer ? { wer } : {}),
    };
    const others = (existing?.lectures ?? []).filter((other) => other.id !== lectureId);

    write(
        "benchmark.json",
        benchmarkSchema.parse({ config: existing?.config ?? {}, lectures: [...others, entry], questions: existing?.questions ?? [] }),
    );

    const lastSegment = segments.at(-1);

    console.log(
        `${lectureId}: "${entry.title}", ${segments.length} segments, ${((lastSegment?.endSeconds ?? 0) / 60).toFixed(1)} minutes, ${transcript.provider} ${transcript.model}`,
    );
    console.log(
        documents.length === 0
            ? "No indexed documents in this course"
            : documents.map((document) => `document: ${document.title} (${document.pageCount} pages)`).join("\n"),
    );

    if (wer) {
        console.log(
            `Correct wer/${lectureId}.machine.txt against the audio and save it as wer/${lectureId}.txt; eval:wer fails until that file exists.`,
        );
    }
}

try {
    await pull();
} finally {
    await db.end();
}
