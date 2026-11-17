import { findMatches, groupHighlights, wrapIndex } from "./transcript-search";
import type { SearchMode, SearchableParagraph, TranscriptMatch } from "./transcript-search";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";

interface UseTranscriptSearchOptions {
    paragraphs: SearchableParagraph[];
    mode: SearchMode;
    container: RefObject<HTMLElement | null>;
}

interface Position {
    matches: TranscriptMatch[];
    index: number;
}

function revealMatch(container: HTMLElement | null, matchId: number) {
    const element = container?.querySelector<HTMLElement>(`[data-match="${matchId}"]`);

    if (!container || !element) {
        return;
    }

    const behavior = globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

    if (container.scrollHeight > container.clientHeight) {
        const offset = element.getBoundingClientRect().top - container.getBoundingClientRect().top;

        container.scrollTo({ top: container.scrollTop + offset - container.clientHeight / 2, behavior });
    } else {
        element.scrollIntoView({ block: "center", behavior });
    }
}

export function useTranscriptSearch({ paragraphs, mode, container }: UseTranscriptSearchOptions) {
    const [query, setQuery] = useState("");
    const [position, setPosition] = useState<Position>({ matches: [], index: 0 });
    const deferredQuery = useDeferredValue(query);

    const matches = useMemo(() => findMatches(paragraphs, mode, deferredQuery), [paragraphs, mode, deferredQuery]);
    const highlights = useMemo(() => groupHighlights(matches), [matches]);

    const index = matches.length === 0 ? -1 : position.matches === matches ? position.index : 0;
    const activeMatch = matches[index];

    const move = useCallback((step: number) => setPosition({ matches, index: wrapIndex(index + step, matches.length) }), [matches, index]);
    const next = useCallback(() => move(1), [move]);
    const previous = useCallback(() => move(-1), [move]);
    const clear = useCallback(() => setQuery(""), []);

    useEffect(() => {
        if (activeMatch) {
            revealMatch(container.current, activeMatch.id);
        }
    }, [activeMatch, container]);

    return { query, setQuery, clear, matchCount: matches.length, index, activeMatch, highlights, next, previous };
}

export type TranscriptSearch = ReturnType<typeof useTranscriptSearch>;
