import type { CourseMembershipRepository } from "./course-membership-repository.ts";
import { CourseAccessError } from "./errors.ts";
import type { CourseRole } from "./model.ts";

export class CourseAccessService {
    private readonly courseMembershipRepository: CourseMembershipRepository;

    constructor(courseMembershipRepository: CourseMembershipRepository) {
        this.courseMembershipRepository = courseMembershipRepository;
    }

    async authorize(courseId: string, userId: string, requiredRole: CourseRole): Promise<CourseRole> {
        const role = await this.courseMembershipRepository.fetchRole(courseId, userId);
        if (!role) {
            throw new CourseAccessError("not_found");
        }

        if (requiredRole === "teacher" && role !== "teacher") {
            throw new CourseAccessError("forbidden");
        }

        return role;
    }
}
