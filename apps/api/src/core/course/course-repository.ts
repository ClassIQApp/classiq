import type { Course, CourseMetadataUpdate, CourseRegistration } from "./model.ts";

export interface CourseRepository {
    register(registration: CourseRegistration): Promise<Course>;
    fetch(courseId: string): Promise<Course | undefined>;
    listCourses(): Promise<Course[]>;
    updateMetadata(courseId: string, update: CourseMetadataUpdate): Promise<Course | undefined>;
}
