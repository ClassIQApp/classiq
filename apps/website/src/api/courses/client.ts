import type { ApiFetch } from "../auth/client";
import type { Course, CourseRegistration, CourseSettingsUpdate, ListCoursesResponse } from "./types";

function coursePath(courseId: string) {
    return `/courses/${encodeURIComponent(courseId)}`;
}

export function createCoursesApi(request: ApiFetch) {
    async function send(path: string, method: "POST" | "PATCH", body: CourseRegistration | CourseSettingsUpdate): Promise<Course> {
        const response = await request(path, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        return response.json();
    }

    async function listCourses(signal?: AbortSignal): Promise<Course[]> {
        const response = await request("/courses", { signal });

        const data: ListCoursesResponse = await response.json();

        return data.items;
    }

    async function fetchCourse(courseId: string, signal?: AbortSignal): Promise<Course> {
        const response = await request(coursePath(courseId), { signal });

        return response.json();
    }

    return {
        listCourses,
        fetchCourse,
        createCourse: (registration: CourseRegistration) => send("/courses", "POST", registration),
        updateCourse: (courseId: string, update: CourseSettingsUpdate) => send(coursePath(courseId), "PATCH", update),
    };
}

export type CoursesApi = ReturnType<typeof createCoursesApi>;
