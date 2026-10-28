import type { CourseMembership } from "../course-access/model.ts";
import type { Course, CourseMetadataUpdate, CourseRegistration, MemberCourse } from "./model.ts";

export interface CourseRepository {
    register(registration: CourseRegistration, creator: Omit<CourseMembership, "courseId">): Promise<MemberCourse>;
    fetch(courseId: string): Promise<Course | undefined>;
    listMemberCourses(userId: string): Promise<MemberCourse[]>;
    updateMetadata(courseId: string, update: CourseMetadataUpdate): Promise<Course | undefined>;
}
