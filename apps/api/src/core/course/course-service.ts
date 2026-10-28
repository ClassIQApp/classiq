import type { CourseRepository } from "./course-repository.ts";
import { CourseError } from "./errors.ts";
import {
    courseMetadataUpdateSchema,
    courseReferenceSchema,
    courseRegistrationSchema,
    type Course,
    type CourseMetadataUpdate,
    type CourseRegistration,
    type MemberCourse,
} from "./model.ts";

export class CourseService {
    private readonly courseRepository: CourseRepository;

    constructor(courseRepository: CourseRepository) {
        this.courseRepository = courseRepository;
    }

    async registerCourse(registration: CourseRegistration, creatorId: string): Promise<MemberCourse> {
        const parsedRegistration = courseRegistrationSchema.safeParse(registration);
        if (!parsedRegistration.success) {
            throw new CourseError("invalid_course");
        }

        return this.courseRepository.register(parsedRegistration.data, { userId: creatorId, role: "teacher" });
    }

    async fetchCourse(courseId: string): Promise<Course> {
        const course = await this.courseRepository.fetch(this.parseCourseId(courseId));
        if (!course) {
            throw new CourseError("not_found");
        }

        return course;
    }

    async listMemberCourses(userId: string): Promise<MemberCourse[]> {
        return this.courseRepository.listMemberCourses(userId);
    }

    async updateCourseMetadata(courseId: string, update: CourseMetadataUpdate): Promise<Course> {
        const parsedCourseId = this.parseCourseId(courseId);
        const parsedUpdate = courseMetadataUpdateSchema.safeParse(update);
        if (!parsedUpdate.success) {
            throw new CourseError("invalid_course");
        }

        const course = await this.courseRepository.updateMetadata(parsedCourseId, parsedUpdate.data);
        if (!course) {
            throw new CourseError("not_found");
        }

        return course;
    }

    private parseCourseId(courseId: string): string {
        const parsedCourseId = courseReferenceSchema.safeParse(courseId);
        if (!parsedCourseId.success) {
            throw new CourseError("invalid_reference");
        }

        return parsedCourseId.data;
    }
}
