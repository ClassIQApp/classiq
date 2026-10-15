import type { CourseResourceFileRepository } from "./course-resource-file-repository.ts";
import { CourseResourceFileError } from "./errors.ts";
import {
    courseResourceFileReferenceSchema,
    courseResourceFileUploadSchema,
    type DownloadedCourseResourceFile,
    type CourseResourceFileReference,
    type CourseResourceFileUpload,
    type CourseResourceFile,
} from "./model.ts";

export class CourseResourceFileService {
    private readonly courseResourceFileRepository: CourseResourceFileRepository;

    constructor(courseResourceFileRepository: CourseResourceFileRepository) {
        this.courseResourceFileRepository = courseResourceFileRepository;
    }

    async uploadResource(reference: CourseResourceFileReference, upload: CourseResourceFileUpload): Promise<CourseResourceFile> {
        const parsedReference = this.parseReference(reference);
        const parsedUpload = courseResourceFileUploadSchema.safeParse(upload);
        if (!parsedUpload.success) {
            throw new CourseResourceFileError("invalid_upload");
        }

        return this.courseResourceFileRepository.upload(parsedReference, parsedUpload.data);
    }

    async fetchResource(reference: CourseResourceFileReference): Promise<DownloadedCourseResourceFile> {
        return this.courseResourceFileRepository.fetch(this.parseReference(reference));
    }

    async deleteResource(reference: CourseResourceFileReference): Promise<void> {
        return this.courseResourceFileRepository.delete(this.parseReference(reference));
    }

    private parseReference(reference: CourseResourceFileReference): CourseResourceFileReference {
        const parsedReference = courseResourceFileReferenceSchema.safeParse(reference);
        if (!parsedReference.success) {
            throw new CourseResourceFileError("invalid_reference");
        }

        return parsedReference.data;
    }
}
