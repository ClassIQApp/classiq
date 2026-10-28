import type { CourseRole } from "../course-access/model.ts";
import type { CourseInvitation, CourseInvitationAcceptance, CourseInvitationDraft } from "./model.ts";

export interface CourseInvitationRepository {
    findAccountId(email: string): Promise<string | undefined>;
    create(draft: CourseInvitationDraft): Promise<CourseInvitation>;
    listPending(userId: string): Promise<CourseInvitation[]>;
    accept(invitationId: string, userId: string, role: CourseRole): Promise<CourseInvitationAcceptance | undefined>;
}
