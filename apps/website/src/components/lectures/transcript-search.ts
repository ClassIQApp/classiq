export type SearchMode = "original" | "es" | "both";

export type LineField = "primary" | "translation";

export interface SearchablePhrase {
    index: number;
    text: string;
    translation?: string;
}

export interface SearchableParagraph {
    key: string;
    phrases: SearchablePhrase[];
}

export interface TextRange {
    start: number;
    end: number;
}

export interface TranscriptMatch extends TextRange {
    id: number;
    paragraphKey: string;
    phraseIndex: number;
    field: LineField;
}

export interface HighlightRange extends TextRange {
    id: number;
}

export interface TextPart {
    text: string;
    matchId?: number;
}

export type ParagraphHighlights = Map<string, HighlightRange[]>;

interface FoldedCharacter {
    folded: string;
    start: number;
    end: number;
}

const COMBINING_MARKS = /\p{M}/gu;

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

function foldCharacter(character: string) {
    return character.normalize("NFD").replaceAll(COMBINING_MARKS, "").toLowerCase();
}

function foldText(text: string) {
    return Array.from(text.matchAll(/[\s\S]/gu), (match) => ({
        folded: foldCharacter(match[0]),
        start: match.index,
        end: match.index + match[0].length,
    }));
}

export function lineKey(phraseIndex: number, field: LineField) {
    return `${phraseIndex}:${field}`;
}

export function findRanges(text: string, query: string): TextRange[] {
    const needle = [...query.trim()].map((character) => foldCharacter(character)).join("");

    if (!needle) {
        return [];
    }

    const characters: FoldedCharacter[] = foldText(text);
    const owners = characters.flatMap((character, index) => Array.from(character.folded, () => index));
    const haystack = characters.map((character) => character.folded).join("");
    const pattern = new RegExp(needle.replaceAll(REGEX_SPECIALS, String.raw`\$&`), "g");

    return Array.from(haystack.matchAll(pattern), (match) => ({
        start: characters[owners[match.index]!]!.start,
        end: characters[owners[match.index + needle.length - 1]!]!.end,
    }));
}

function searchableLines(phrases: SearchablePhrase[], mode: SearchMode) {
    const primary = phrases.map((phrase) => ({
        phraseIndex: phrase.index,
        field: "primary" as const,
        text: mode === "es" ? (phrase.translation ?? phrase.text) : phrase.text,
    }));

    if (mode !== "both") {
        return primary;
    }

    return [
        ...primary,
        ...phrases.map((phrase) => ({ phraseIndex: phrase.index, field: "translation" as const, text: phrase.translation ?? "" })),
    ];
}

export function findMatches(paragraphs: SearchableParagraph[], mode: SearchMode, query: string): TranscriptMatch[] {
    return paragraphs
        .flatMap((paragraph) =>
            searchableLines(paragraph.phrases, mode).flatMap((line) =>
                findRanges(line.text, query).map((range) => ({
                    ...range,
                    paragraphKey: paragraph.key,
                    phraseIndex: line.phraseIndex,
                    field: line.field,
                })),
            ),
        )
        .map((match, id) => ({ ...match, id }));
}

export function groupHighlights(matches: TranscriptMatch[]) {
    return matches.reduce((byParagraph, match) => {
        const highlights = byParagraph.get(match.paragraphKey) ?? new Map<string, HighlightRange[]>();
        const key = lineKey(match.phraseIndex, match.field);

        highlights.set(key, [...(highlights.get(key) ?? []), { id: match.id, start: match.start, end: match.end }]);

        return byParagraph.set(match.paragraphKey, highlights);
    }, new Map<string, ParagraphHighlights>());
}

export function splitByRanges(text: string, ranges: HighlightRange[] | undefined): TextPart[] {
    if (!ranges?.length) {
        return [{ text }];
    }

    const { parts, cursor } = ranges.reduce<{ parts: TextPart[]; cursor: number }>(
        (state, range) => {
            const start = Math.max(range.start, state.cursor);

            if (range.end <= start) {
                return state;
            }

            return {
                parts: [
                    ...state.parts,
                    { text: text.slice(state.cursor, start) },
                    { text: text.slice(start, range.end), matchId: range.id },
                ],
                cursor: range.end,
            };
        },
        { parts: [], cursor: 0 },
    );

    return [...parts, { text: text.slice(cursor) }].filter((part) => part.text.length > 0);
}

export function wrapIndex(index: number, count: number) {
    return count === 0 ? -1 : ((index % count) + count) % count;
}
