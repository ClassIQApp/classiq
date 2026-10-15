import type { CourseResourceFile, CourseResourceFileReference, CourseResourceFileUpload, DownloadedCourseResourceFile } from "./model.ts";

export interface CourseResourceFileRepository {
    upload(reference: CourseResourceFileReference, upload: CourseResourceFileUpload): Promise<CourseResourceFile>;
    fetch(reference: CourseResourceFileReference): Promise<DownloadedCourseResourceFile>;
    delete(reference: CourseResourceFileReference): Promise<void>;
}
