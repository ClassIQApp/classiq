import type { ListCoursesResponse } from "./types";
import { useQuery } from "@tanstack/react-query";

export function useCourses(enabled: boolean) {
    return useQuery({
        queryKey: ["courses"],
        enabled,
        queryFn: async ({ signal }) => {
            const apiUrl = import.meta.env.VITE_API_URL;
            const response = await fetch(`${apiUrl}/courses`, { signal });
            if (!response.ok) {
                throw new Error("Course request failed");
            }

            const data: ListCoursesResponse = await response.json();

            return data.items;
        },
    });
}
