import type { CourseResourceRepository } from "./course-resource-repository.ts";
import { CourseResourceError } from "./errors.ts";
import {
    courseResourceReferenceSchema,
    courseResourceRegistrationSchema,
    type CourseResource,
    type CourseResourceReference,
    type CourseResourceRegistration,
    type CourseResourceUploadStatus,
} from "./model.ts";

export class CourseResourceService {
    private readonly courseResourceRepository: CourseResourceRepository;

    constructor(courseResourceRepository: CourseResourceRepository) {
        this.courseResourceRepository = courseResourceRepository;
    }

    async registerResource(courseId: string, registration: CourseResourceRegistration): Promise<CourseResource> {
        const parsedCourseId = this.parseCourseId(courseId);
        const parsedRegistration = courseResourceRegistrationSchema.safeParse(registration);
        if (!parsedRegistration.success) {
            throw new CourseResourceError("invalid_resource");
        }

        return this.courseResourceRepository.register(parsedCourseId, parsedRegistration.data);
    }

    async fetchResource(reference: CourseResourceReference): Promise<CourseResource> {
        const parsedReference = courseResourceReferenceSchema.safeParse(reference);
        if (!parsedReference.success) {
            throw new CourseResourceError("invalid_reference");
        }

        const resource = await this.courseResourceRepository.fetch(parsedReference.data);
        if (!resource) {
            throw new CourseResourceError("not_found");
        }

        return resource;
    }

    async listCourseResources(courseId: string): Promise<CourseResource[]> {
        return this.courseResourceRepository.listCourseResources(this.parseCourseId(courseId));
    }

    async markResourceUploaded(reference: CourseResourceReference): Promise<CourseResource> {
        const resource = await this.fetchResource(reference);
        if (resource.name === null || resource.contentType === null || resource.contentLength === null) {
            throw new CourseResourceError("invalid_state");
        }

        return this.updateUploadStatus(resource, "uploaded", ["pending", "failed"]);
    }

    async markResourceUploadFailed(reference: CourseResourceReference): Promise<CourseResource> {
        const resource = await this.fetchResource(reference);

        return this.updateUploadStatus(resource, "failed", ["pending"]);
    }

    private async updateUploadStatus(
        resource: CourseResource,
        status: CourseResourceUploadStatus,
        allowedStatuses: readonly CourseResourceUploadStatus[],
    ): Promise<CourseResource> {
        if (resource.uploadStatus === status) {
            return resource;
        }

        if (!allowedStatuses.includes(resource.uploadStatus)) {
            throw new CourseResourceError("invalid_state");
        }

        const reference = { courseId: resource.courseId, resourceId: resource.id };
        const updated = await this.courseResourceRepository.updateUploadStatus(reference, status, allowedStatuses);
        if (updated) {
            return updated;
        }

        const current = await this.fetchResource(reference);
        if (current.uploadStatus !== status) {
            throw new CourseResourceError("invalid_state");
        }

        return current;
    }

    private parseCourseId(courseId: string): string {
        const parsedCourseId = courseResourceReferenceSchema.shape.courseId.safeParse(courseId);
        if (!parsedCourseId.success) {
            throw new CourseResourceError("invalid_reference");
        }

        return parsedCourseId.data;
    }
}
