import type { Course } from "./model.ts";

export interface CourseRepository {
    listCourses(): Promise<Course[]>;
}
