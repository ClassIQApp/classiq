import { ApiError } from "../../api/auth/client";
import { useAuth } from "../../api/auth/provider";
import type { Lecture } from "../../api/lectures/types";
import { createResourcesApi } from "../../api/resources/client";
import { createSearchApi, searchQueryKey } from "../../api/search/client";
import type { ContentKind, SearchApi, SearchFilters, SearchPassage } from "../../api/search/client";
import { formatTimestamp } from "../lectures/timestamp";
import { openInNewTab } from "./open-in-new-tab";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

const SEARCH_DEBOUNCE_MS = 300;

const MAX_QUERY_LENGTH = 500;

const kindLabelByKind: Record<ContentKind, string> = {
    resource: "PDF resource",
    transcript: "Lecture transcript",
};

type ResourcesApi = ReturnType<typeof createResourcesApi>;

interface CourseSearchProps {
    courseId: string;
    lectures: Lecture[];
    onOpenLecture: (lectureId: string, startSeconds?: number) => void;
}

interface SearchPanelProps extends CourseSearchProps {
    accountId: string;
    api: SearchApi;
    resources: ResourcesApi;
}

interface SearchResultsProps {
    accountId: string;
    courseId: string;
    filters: SearchFilters;
    lectures: Lecture[];
    api: SearchApi;
    opening: string | null;
    onOpenResource: (passage: SearchPassage) => void;
    onOpenLecture: (passage: SearchPassage) => void;
}

interface SearchResultProps {
    passage: SearchPassage;
    lectures: Lecture[];
    opening: string | null;
    onOpenResource: (passage: SearchPassage) => void;
    onOpenLecture: (passage: SearchPassage) => void;
}

export function passageLocation(passage: SearchPassage) {
    if (passage.pageNumber !== undefined) {
        return `Page ${passage.pageNumber}`;
    }

    if (passage.startSeconds !== undefined) {
        return formatTimestamp(passage.startSeconds);
    }

    return undefined;
}

function useDebouncedValue<T>(value: T, delay: number) {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timeout = setTimeout(() => setDebounced(value), delay);

        return () => clearTimeout(timeout);
    }, [value, delay]);

    return debounced;
}

export default function CourseSearch(props: CourseSearchProps) {
    const { state, apiFetch } = useAuth();
    const api = useMemo(() => createSearchApi(apiFetch), [apiFetch]);
    const resources = useMemo(() => createResourcesApi(apiFetch), [apiFetch]);

    if (state.status !== "authenticated") {
        return null;
    }

    return <SearchPanel key={`${state.user.id}:${props.courseId}`} {...props} accountId={state.user.id} api={api} resources={resources} />;
}

export function SearchPanel({ courseId, lectures, onOpenLecture, accountId, api, resources }: SearchPanelProps) {
    const [text, setText] = useState("");
    const [kind, setKind] = useState<ContentKind | "all">("all");
    const [lectureId, setLectureId] = useState("");
    const [opening, setOpening] = useState<string | null>(null);
    const [error, setError] = useState("");
    const lifetime = useRef<AbortController | null>(null);
    const debouncedText = useDebouncedValue(text.trim(), SEARCH_DEBOUNCE_MS);

    const filters: SearchFilters = {
        text: debouncedText,
        kind: kind === "all" ? undefined : kind,
        lectureId: lectureId || undefined,
    };

    useEffect(() => {
        const controller = new AbortController();
        lifetime.current = controller;

        return () => controller.abort();
    }, []);

    async function openResource(passage: SearchPassage) {
        const signal = lifetime.current?.signal;
        const resourceId = passage.resourceId;

        if (!signal || signal.aborted || !resourceId) {
            return;
        }

        setOpening(passage.id);
        setError("");

        const resolveUrl = async () => {
            const url = await resources.download(courseId, resourceId, signal);

            if (passage.pageNumber === undefined) {
                return url;
            }

            return `${url}#page=${passage.pageNumber}`;
        };

        try {
            const outcome = await openInNewTab(resolveUrl, signal);

            if (outcome === "blocked") {
                setError("Allow popups and try opening the PDF again.");
            }
        } catch (error_) {
            if (!signal.aborted) {
                setError(error_ instanceof Error ? error_.message : "Could not open this PDF. Try again for a fresh link.");
            }
        } finally {
            if (!signal.aborted) {
                setOpening(null);
            }
        }
    }

    function openLecture(passage: SearchPassage) {
        if (passage.lectureId) {
            onOpenLecture(passage.lectureId, passage.startSeconds);
        }
    }

    return (
        <section className="search-container" aria-label="Course search">
            <h2>Search this course</h2>
            <p className="search-desc">Find passages in lecture transcripts and PDF resources shared with this course.</p>
            <form role="search" className="search-filters" onSubmit={(event) => event.preventDefault()}>
                <label>
                    Search
                    <input
                        type="search"
                        value={text}
                        maxLength={MAX_QUERY_LENGTH}
                        placeholder="e.g. activation energy"
                        onChange={(event) => setText(event.target.value)}
                    />
                </label>
                <label>
                    Content
                    <select value={kind} onChange={(event) => setKind(event.target.value as ContentKind | "all")}>
                        <option value="all">All content</option>
                        <option value="resource">{kindLabelByKind.resource}s</option>
                        <option value="transcript">{kindLabelByKind.transcript}s</option>
                    </select>
                </label>
                <label>
                    Lecture
                    <select value={lectureId} onChange={(event) => setLectureId(event.target.value)}>
                        <option value="">All lectures</option>
                        {lectures.map((lecture) => (
                            <option key={lecture.id} value={lecture.id}>
                                {lecture.title}
                            </option>
                        ))}
                    </select>
                </label>
            </form>
            {error && <p role="alert">{error}</p>}
            <SearchResults
                accountId={accountId}
                courseId={courseId}
                filters={filters}
                lectures={lectures}
                api={api}
                opening={opening}
                onOpenResource={(passage) => void openResource(passage)}
                onOpenLecture={openLecture}
            />
        </section>
    );
}

export function SearchResults({ accountId, courseId, filters, lectures, api, opening, onOpenResource, onOpenLecture }: SearchResultsProps) {
    const results = useQuery({
        queryKey: searchQueryKey(accountId, courseId, filters),
        queryFn: ({ signal }) => api.search(courseId, filters, signal),
        enabled: filters.text.length > 0,
        retry: false,
    });

    if (filters.text.length === 0) {
        return <p className="search-hint">Enter a word or phrase to search across this course.</p>;
    }

    if (results.isPending) {
        return <p role="status">Searching…</p>;
    }

    if (results.isError) {
        const message = results.error instanceof ApiError ? results.error.message : "Search is unavailable right now.";

        return (
            <p role="alert">
                {message}{" "}
                <button type="button" onClick={() => void results.refetch()}>
                    Retry
                </button>
            </p>
        );
    }

    if (results.data.length === 0) {
        return <p role="status">No results for “{filters.text}”. Try different words or clear the filters.</p>;
    }

    return (
        <>
            <p role="status" className="search-hint">
                {results.data.length === 1 ? "1 result" : `${results.data.length} results`}
            </p>
            <ol className="search-results">
                {results.data.map((passage) => (
                    <SearchResult
                        key={passage.id}
                        passage={passage}
                        lectures={lectures}
                        opening={opening}
                        onOpenResource={onOpenResource}
                        onOpenLecture={onOpenLecture}
                    />
                ))}
            </ol>
        </>
    );
}

function SearchResult({ passage, lectures, opening, onOpenResource, onOpenLecture }: SearchResultProps) {
    const location = passageLocation(passage);
    const lecture = lectures.find((item) => item.id === passage.lectureId);

    function resourceLabel() {
        if (opening === passage.id) {
            return "Opening…";
        }

        if (location) {
            return `Open PDF at ${location.toLowerCase()}`;
        }

        return "Open PDF";
    }

    function action() {
        if (passage.kind === "resource") {
            return (
                <button type="button" className="resources-view-btn" disabled={opening !== null} onClick={() => onOpenResource(passage)}>
                    {resourceLabel()}
                </button>
            );
        }

        return (
            <button type="button" className="resources-view-btn" onClick={() => onOpenLecture(passage)}>
                {location ? `Open lecture at ${location}` : "Open lecture"}
            </button>
        );
    }

    return (
        <li className="search-result">
            <div className="search-result-heading">
                <span className="search-result-title">{passage.title}</span>
                <span className="search-result-meta">
                    {kindLabelByKind[passage.kind]}
                    {location && ` · ${location}`}
                    {passage.kind === "resource" && lecture && ` · ${lecture.title}`}
                </span>
            </div>
            <p className="search-result-snippet">{passage.content}</p>
            {action()}
        </li>
    );
}
