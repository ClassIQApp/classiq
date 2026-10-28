import { useAuth } from "../auth/provider";
import { createCoursesApi } from "./client";
import type { CoursesApi } from "./client";
import type { Course, CourseRegistration, CourseSettingsUpdate } from "./types";
import { mutationOptions, queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

export function courseListQueryKey(userId: string) {
    return ["courses", userId] as const;
}

export function courseQueryKey(userId: string, courseId: string) {
    return ["courses", userId, courseId] as const;
}

export function courseListQueryOptions(api: CoursesApi, userId: string) {
    return queryOptions({
        queryKey: courseListQueryKey(userId),
        queryFn: ({ signal }) => api.listCourses(signal),
        retry: false,
    });
}

export function courseQueryOptions(api: CoursesApi, userId: string, courseId: string) {
    return queryOptions({
        queryKey: courseQueryKey(userId, courseId),
        queryFn: ({ signal }) => api.fetchCourse(courseId, signal),
        retry: false,
    });
}

export function createCourseMutationOptions(api: CoursesApi, queryClient: QueryClient, userId: string) {
    return mutationOptions({
        mutationFn: (registration: CourseRegistration) => api.createCourse(registration),
        onSuccess: async (course) => {
            queryClient.setQueryData(courseQueryKey(userId, course.id), course);

            await queryClient.invalidateQueries({ queryKey: courseListQueryKey(userId) });
        },
    });
}

export function updateCourseMutationOptions(api: CoursesApi, queryClient: QueryClient, userId: string) {
    return mutationOptions({
        mutationFn: ({ courseId, update }: { courseId: string; update: CourseSettingsUpdate }) => api.updateCourse(courseId, update),
        onSuccess: async (course) => {
            queryClient.setQueryData(courseQueryKey(userId, course.id), course);

            await queryClient.invalidateQueries({ queryKey: courseListQueryKey(userId) });
        },
        onError: () => queryClient.invalidateQueries({ queryKey: courseListQueryKey(userId) }),
    });
}

export function forgetUnavailableCourse(queryClient: QueryClient, userId: string, courseId: string) {
    queryClient.setQueryData<Course[]>(courseListQueryKey(userId), (courses) => courses?.filter((course) => course.id !== courseId));
}

function useCourseAccount() {
    const { state, apiFetch } = useAuth();
    const api = useMemo(() => createCoursesApi(apiFetch), [apiFetch]);

    if (state.status !== "authenticated") {
        throw new Error("Courses require a signed-in account");
    }

    return { api, userId: state.user.id };
}

export function useCourses() {
    const { api, userId } = useCourseAccount();

    return useQuery(courseListQueryOptions(api, userId));
}

export function useCourse(courseId: string) {
    const { api, userId } = useCourseAccount();

    return useQuery(courseQueryOptions(api, userId, courseId));
}

export function useCreateCourse() {
    const { api, userId } = useCourseAccount();
    const queryClient = useQueryClient();

    return useMutation(createCourseMutationOptions(api, queryClient, userId));
}

export function useUpdateCourse() {
    const { api, userId } = useCourseAccount();
    const queryClient = useQueryClient();

    return useMutation(updateCourseMutationOptions(api, queryClient, userId));
}

export function useForgetUnavailableCourse() {
    const { userId } = useCourseAccount();
    const queryClient = useQueryClient();

    return useCallback((courseId: string) => forgetUnavailableCourse(queryClient, userId, courseId), [queryClient, userId]);
}
