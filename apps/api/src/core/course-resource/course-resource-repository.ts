import type { CourseResource, CourseResourceReference, CourseResourceRegistration, CourseResourceUploadStatus } from "./model.ts";

export interface CourseResourceRepository {
    register(courseId: string, registration: CourseResourceRegistration): Promise<CourseResource>;
    fetch(reference: CourseResourceReference): Promise<CourseResource | undefined>;
    listCourseResources(courseId: string): Promise<CourseResource[]>;
    updateUploadStatus(
        reference: CourseResourceReference,
        status: CourseResourceUploadStatus,
        allowedStatuses: readonly CourseResourceUploadStatus[],
    ): Promise<CourseResource | undefined>;
}
