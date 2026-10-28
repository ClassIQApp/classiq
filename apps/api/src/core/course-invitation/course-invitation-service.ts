import type { CourseMembershipRepository } from "../course-access/course-membership-repository.ts";
import type { CourseInvitationRepository } from "./course-invitation-repository.ts";
import { CourseInvitationError } from "./errors.ts";
import { invitationRequestSchema, type CourseInvitation, type CourseInvitationAcceptance, type InvitationRequest } from "./model.ts";

export class CourseInvitationService {
    private readonly invitationRepository: CourseInvitationRepository;
    private readonly membershipRepository: CourseMembershipRepository;

    constructor(invitationRepository: CourseInvitationRepository, membershipRepository: CourseMembershipRepository) {
        this.invitationRepository = invitationRepository;
        this.membershipRepository = membershipRepository;
    }

    async invite(courseId: string, invitedBy: string, request: InvitationRequest): Promise<CourseInvitation> {
        const parsedRequest = invitationRequestSchema.safeParse(request);
        if (!parsedRequest.success) {
            throw new CourseInvitationError("invalid_email");
        }

        const recipientId = await this.invitationRepository.findAccountId(parsedRequest.data.email);
        if (!recipientId) {
            throw new CourseInvitationError("account_not_found");
        }

        const role = await this.membershipRepository.fetchRole(courseId, recipientId);
        if (role) {
            throw new CourseInvitationError("already_member");
        }

        return this.invitationRepository.create({ courseId, recipientId, invitedBy });
    }

    async listPending(userId: string): Promise<CourseInvitation[]> {
        return this.invitationRepository.listPending(userId);
    }

    async accept(invitationId: string, userId: string): Promise<CourseInvitationAcceptance> {
        const acceptance = await this.invitationRepository.accept(invitationId, userId, "member");
        if (!acceptance) {
            throw new CourseInvitationError("not_found");
        }

        return acceptance;
    }
}
