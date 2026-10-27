import type { CourseMembership, CourseRole } from "./model.ts";

export interface CourseMembershipRepository {
    create(membership: CourseMembership): Promise<CourseMembership>;
    fetchRole(courseId: string, userId: string): Promise<CourseRole | undefined>;
}
