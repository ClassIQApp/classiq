import type { ApiFetch } from "../auth/client";

export const MAX_BOOKMARK_NOTE_LENGTH = 280;

export interface Bookmark {
    id: string;
    courseId: string;
    lectureId: string;
    startSeconds: number;
    note: string;
    createdAt: string;
}

export function bookmarksQueryKey(accountId: string, courseId: string, lectureId: string) {
    return ["accounts", accountId, "courses", courseId, "lectures", lectureId, "bookmarks"] as const;
}

const root = (courseId: string, lectureId: string) =>
    `/courses/${encodeURIComponent(courseId)}/lectures/${encodeURIComponent(lectureId)}/bookmarks`;

const jsonRequest = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
});

export function createBookmarksApi(request: ApiFetch) {
    async function list(courseId: string, lectureId: string, signal?: AbortSignal): Promise<Bookmark[]> {
        const response = await request(root(courseId, lectureId), { signal });
        const data: { items: Bookmark[] } = await response.json();

        return data.items;
    }

    async function create(courseId: string, lectureId: string, startSeconds: number): Promise<Bookmark> {
        const response = await request(root(courseId, lectureId), jsonRequest("POST", { startSeconds }));

        return response.json();
    }

    async function updateNote(courseId: string, lectureId: string, bookmarkId: string, note: string): Promise<Bookmark> {
        const response = await request(`${root(courseId, lectureId)}/${encodeURIComponent(bookmarkId)}`, jsonRequest("PATCH", { note }));

        return response.json();
    }

    async function remove(courseId: string, lectureId: string, bookmarkId: string): Promise<void> {
        await request(`${root(courseId, lectureId)}/${encodeURIComponent(bookmarkId)}`, { method: "DELETE" });
    }

    return { list, create, updateNote, remove };
}

export type BookmarksApi = ReturnType<typeof createBookmarksApi>;
