import { useAuth } from "../auth/provider";
import type { ListCoursesResponse } from "./types";
import { useQuery } from "@tanstack/react-query";

export function useCourses(enabled = true) {
    const { state, apiFetch } = useAuth();
    const userId = state.status === "authenticated" ? state.user.id : null;

    return useQuery({
        queryKey: ["courses", userId],
        enabled: enabled && userId !== null,
        retry: false,
        queryFn: async ({ signal }) => {
            const response = await apiFetch("/courses", { signal });

            const data: ListCoursesResponse = await response.json();

            return data.items;
        },
    });
}
