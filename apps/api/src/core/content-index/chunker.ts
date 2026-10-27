import type { ContentChunk, ContentLocation, ContentSection } from "./model.ts";

export interface ChunkingOptions {
    readonly maxChars: number;
    readonly overlapChars: number;
}

export const DEFAULT_CHUNKING: ChunkingOptions = { maxChars: 1500, overlapChars: 200 };

interface Unit {
    readonly text: string;
    readonly location: ContentLocation;
}

/**
 * Packs sections into chunks of at most `maxChars`, repeating up to `overlapChars` of trailing text
 * at the start of the next chunk. Chunks never span resource pages, so every chunk keeps one exact
 * page number; transcript chunks span the time range of the segments they contain.
 */
export function chunkSections(sections: readonly ContentSection[], options: ChunkingOptions = DEFAULT_CHUNKING): ContentChunk[] {
    const units = sections.flatMap((section) =>
        splitUnits(section.text.replaceAll(/\s+/g, " ").trim(), options.maxChars).map((text) => ({ text, location: locationOf(section) })),
    );
    const chunks: ContentChunk[] = [];
    let current: Unit[] = [];

    for (const unit of units) {
        if (current.length > 0) {
            const samePage = current[0]!.location.pageNumber === unit.location.pageNumber;

            if (!samePage || joinedLength(current) + 1 + unit.text.length > options.maxChars) {
                chunks.push(toChunk(current, chunks.length));
                current = samePage ? overlapTail(current, Math.min(options.overlapChars, options.maxChars - unit.text.length - 1)) : [];
            }
        }

        current.push(unit);
    }

    if (current.length > 0) {
        chunks.push(toChunk(current, chunks.length));
    }

    return chunks;
}

function locationOf(section: ContentSection): ContentLocation {
    return "pageNumber" in section
        ? { pageNumber: section.pageNumber }
        : { startSeconds: section.startSeconds, endSeconds: section.endSeconds };
}

/** Splits text longer than `maxChars` at sentence boundaries, then at words, then mid-word as a last resort. */
function splitUnits(text: string, maxChars: number): string[] {
    if (text.length <= maxChars) {
        return text ? [text] : [];
    }

    return text.split(/(?<=[.!?])\s+/).flatMap((sentence) =>
        sentence.length <= maxChars
            ? [sentence]
            : pack(
                  sentence.split(" ").flatMap((word) => sliceWord(word, maxChars)),
                  maxChars,
              ),
    );
}

function sliceWord(word: string, maxChars: number): string[] {
    return Array.from({ length: Math.ceil(word.length / maxChars) }, (_, index) => word.slice(index * maxChars, (index + 1) * maxChars));
}

function pack(parts: readonly string[], maxChars: number): string[] {
    const packed: string[] = [];

    for (const part of parts) {
        const last = packed.at(-1);

        if (last !== undefined && last.length + 1 + part.length <= maxChars) {
            packed[packed.length - 1] = `${last} ${part}`;
        } else {
            packed.push(part);
        }
    }

    return packed;
}

function joinedLength(units: readonly Unit[]): number {
    return units.reduce((total, unit) => total + unit.text.length, Math.max(units.length - 1, 0));
}

function overlapTail(units: readonly Unit[], budget: number): Unit[] {
    const tail: Unit[] = [];

    for (const unit of units.toReversed()) {
        if (joinedLength([unit, ...tail]) > budget) {
            break;
        }

        tail.unshift(unit);
    }

    return tail;
}

function toChunk(units: readonly Unit[], position: number): ContentChunk {
    const content = units.map((unit) => unit.text).join(" ");
    const { pageNumber } = units[0]!.location;

    if (pageNumber !== undefined) {
        return { position, content, pageNumber };
    }

    return {
        position,
        content,
        startSeconds: Math.min(...units.map((unit) => unit.location.startSeconds!)),
        endSeconds: Math.max(...units.map((unit) => unit.location.endSeconds!)),
    };
}
