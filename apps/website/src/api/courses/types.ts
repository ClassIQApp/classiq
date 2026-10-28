import type { Lecture } from "../lectures/types";

export type CourseRole = "teacher" | "member";

export interface Course {
    id: string;
    code: string;
    name: string;
    description: string;
    role: CourseRole;
    lectures: Lecture[];
}

export interface ListCoursesResponse {
    items: Course[];
}

export interface CourseRegistration {
    code: string;
    name: string;
    slug: string;
    description: string;
}

export type CourseSettingsUpdate = Omit<CourseRegistration, "slug">;
