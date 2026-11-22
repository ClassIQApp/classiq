import { useAuth } from "../auth/provider";
import { bookmarksQueryKey, createBookmarksApi } from "./client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

export function useBookmarks(courseId: string, lectureId: string) {
    const { state, apiFetch } = useAuth();
    const queryClient = useQueryClient();
    const api = useMemo(() => createBookmarksApi(apiFetch), [apiFetch]);
    const userId = state.status === "authenticated" ? state.user.id : "";
    const queryKey = bookmarksQueryKey(userId, courseId, lectureId);
    const [lastAddedId, setLastAddedId] = useState<string>();
    const refresh = () => queryClient.invalidateQueries({ queryKey });

    const list = useQuery({
        queryKey,
        queryFn: ({ signal }) => api.list(courseId, lectureId, signal),
        enabled: userId !== "",
        retry: false,
    });

    const add = useMutation({
        mutationFn: (startSeconds: number) => api.create(courseId, lectureId, startSeconds),
        onSuccess: async (bookmark) => {
            setLastAddedId(bookmark.id);
            await refresh();
        },
    });

    const editNote = useMutation({
        mutationFn: (input: { id: string; note: string }) => api.updateNote(courseId, lectureId, input.id, input.note),
        onSuccess: refresh,
    });

    const remove = useMutation({
        mutationFn: (id: string) => api.remove(courseId, lectureId, id),
        onSuccess: refresh,
    });

    return { list, add, editNote, remove, lastAddedId };
}

export type LectureBookmarks = ReturnType<typeof useBookmarks>;
