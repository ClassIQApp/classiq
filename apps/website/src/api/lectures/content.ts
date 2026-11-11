import { ApiError } from "../auth/client";
import type { ApiFetch } from "../auth/client";
import { lecturePath } from "./processing";

export interface TranscriptSegment {
    text: string;
    startSeconds: number;
    endSeconds: number;
    language: string;
    speakerLabel?: string;
    spanish?: string;
}

export interface Transcript {
    recordingId: string;
    durationSeconds: number;
    language: string;
    contentHash: string;
    provider: string;
    model: string;
    translationStatus: "succeeded" | "failed";
    segments: TranscriptSegment[];
}

export interface SpanishTranscript {
    language: "es";
    provider: string;
    model: string;
    segments: TranscriptSegment[];
}

export interface TimeRange {
    startSeconds: number;
    endSeconds: number;
}

export interface KeyTerm {
    term: string;
    explanation: string;
    sources: TimeRange[];
}

interface GeneratedContent<Kind extends string, Content> {
    kind: Kind;
    content: Content;
    sourceHash: string;
    provider: string;
    model: string;
}

export type Summary = GeneratedContent<
    "summary",
    {
        text: string;
    }
>;

export type KeyTerms = GeneratedContent<
    "key_terms",
    {
        terms: KeyTerm[];
    }
>;

export type LectureContentKind = "transcript" | "spanish" | "summary" | "key_terms";

export type GeneratedContentLanguage = "en" | "es" | "ar" | "de" | "fr";

const pathByKind: Record<LectureContentKind, string> = {
    transcript: "transcript",
    spanish: "transcript/translations/es",
    summary: "generated-content/summary",
    key_terms: "generated-content/key_terms",
};

async function fetchContent<T>(
    apiFetch: ApiFetch,
    courseId: string,
    lectureId: string,
    kind: LectureContentKind,
    signal?: AbortSignal,
    language?: GeneratedContentLanguage,
) {
    try {
        const basePath = `${lecturePath(courseId, lectureId)}/${pathByKind[kind]}`;

        const path =
            language && (kind === "summary" || kind === "key_terms") ? `${basePath}?language=${encodeURIComponent(language)}` : basePath;

        const response = await apiFetch(path, {
            signal,
        });

        return (await response.json()) as T;
    } catch (error) {
        if (error instanceof ApiError && error.status === 404 && error.code === "NOT_FOUND") {
            return null;
        }

        throw error;
    }
}

export const fetchTranscript = (apiFetch: ApiFetch, courseId: string, lectureId: string, signal?: AbortSignal) =>
    fetchContent<Transcript>(apiFetch, courseId, lectureId, "transcript", signal);

export const fetchSpanishTranscript = (apiFetch: ApiFetch, courseId: string, lectureId: string, signal?: AbortSignal) =>
    fetchContent<SpanishTranscript>(apiFetch, courseId, lectureId, "spanish", signal);

export const fetchSummary = (
    apiFetch: ApiFetch,
    courseId: string,
    lectureId: string,
    language: GeneratedContentLanguage = "en",
    signal?: AbortSignal,
) => fetchContent<Summary>(apiFetch, courseId, lectureId, "summary", signal, language);

export const fetchKeyTerms = (
    apiFetch: ApiFetch,
    courseId: string,
    lectureId: string,
    language: GeneratedContentLanguage = "en",
    signal?: AbortSignal,
) => fetchContent<KeyTerms>(apiFetch, courseId, lectureId, "key_terms", signal, language);

export function isFixtureProvider(provider: string) {
    return provider.includes("fixture");
}
