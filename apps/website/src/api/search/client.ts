import type { ApiFetch } from "../auth/client";

export type ContentKind = "transcript" | "resource";

export interface SearchPassage {
    id: string;
    kind: ContentKind;
    courseId: string;
    lectureId?: string;
    resourceId?: string;
    title: string;
    content: string;
    pageNumber?: number;
    startSeconds?: number;
    endSeconds?: number;
    score: number;
}

export interface SearchFilters {
    text: string;
    kind?: ContentKind;
    lectureId?: string;
}

const SEARCH_RESULT_LIMIT = 20;

export const searchQueryKey = (accountId: string, courseId: string, filters: SearchFilters) =>
    ["accounts", accountId, "courses", courseId, "search", filters] as const;

export function createSearchApi(request: ApiFetch) {
    async function search(courseId: string, filters: SearchFilters, signal?: AbortSignal): Promise<SearchPassage[]> {
        const parameters = new URLSearchParams({ q: filters.text, limit: String(SEARCH_RESULT_LIMIT) });

        if (filters.kind) {
            parameters.set("kind", filters.kind);
        }

        if (filters.lectureId) {
            parameters.set("lectureId", filters.lectureId);
        }

        const response = await request(`/courses/${encodeURIComponent(courseId)}/search?${parameters}`, { signal });
        const data: { items: SearchPassage[] } = await response.json();

        return data.items;
    }

    return { search };
}

export type SearchApi = ReturnType<typeof createSearchApi>;
