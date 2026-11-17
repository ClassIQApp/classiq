import { splitByRanges } from "./transcript-search";
import type { HighlightRange } from "./transcript-search";
import type { TranscriptSearch } from "./use-transcript-search";
import { CaretDownIcon, CaretUpIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import type { KeyboardEvent } from "react";

const MAX_QUERY_LENGTH = 200;

interface TranscriptSearchBarProps {
    search: TranscriptSearch;
}

interface HighlightedTextProps {
    text: string;
    ranges: HighlightRange[] | undefined;
    activeMatchId: number | null;
}

function countLabel(search: TranscriptSearch) {
    if (!search.query.trim()) {
        return "";
    }

    return search.matchCount === 0 ? "No matches" : `${search.index + 1} of ${search.matchCount}`;
}

export function HighlightedText({ text, ranges, activeMatchId }: HighlightedTextProps) {
    return splitByRanges(text, ranges).map((part, index) =>
        part.matchId === undefined ? (
            part.text
        ) : (
            <mark
                key={index}
                data-match={part.matchId}
                className={part.matchId === activeMatchId ? "lecture-match is-active" : "lecture-match"}
            >
                {part.text}
            </mark>
        ),
    );
}

export default function TranscriptSearchBar({ search }: TranscriptSearchBarProps) {
    const hasMatches = search.matchCount > 0;

    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === "Enter") {
            event.preventDefault();

            if (event.shiftKey) {
                search.previous();
            } else {
                search.next();
            }
        } else if (event.key === "Escape" && search.query) {
            event.preventDefault();
            search.clear();
        }
    }

    return (
        <div className="lecture-search" role="search">
            <div className="lecture-search-field">
                <MagnifyingGlassIcon size={16} aria-hidden />
                <input
                    type="text"
                    value={search.query}
                    maxLength={MAX_QUERY_LENGTH}
                    placeholder="Search transcript"
                    aria-label="Search transcript"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => search.setQuery(event.target.value)}
                    onKeyDown={handleKeyDown}
                />
                {search.query && (
                    <button type="button" className="lecture-search-icon" aria-label="Clear search" onClick={search.clear}>
                        <XIcon size={14} aria-hidden />
                    </button>
                )}
            </div>
            <span className="lecture-search-count" role="status" aria-live="polite">
                {countLabel(search)}
            </span>
            <button
                type="button"
                className="lecture-search-icon"
                aria-label="Previous match"
                disabled={!hasMatches}
                onClick={search.previous}
            >
                <CaretUpIcon size={16} aria-hidden />
            </button>
            <button type="button" className="lecture-search-icon" aria-label="Next match" disabled={!hasMatches} onClick={search.next}>
                <CaretDownIcon size={16} aria-hidden />
            </button>
        </div>
    );
}
