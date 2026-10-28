export type CourseInvitationErrorCode =
    "invalid_email" | "account_not_found" | "already_member" | "invitation_exists" | "not_found" | "provider_error";

const messages: Record<CourseInvitationErrorCode, string> = {
    invalid_email: "Enter a valid email address.",
    account_not_found: "No ClassIQ account uses that email. Ask them to create an account first.",
    already_member: "That account is already part of this course.",
    invitation_exists: "That account already has a pending invitation to this course.",
    not_found: "The invitation was not found.",
    provider_error: "Invitations are unavailable right now. Please try again.",
};

export class CourseInvitationError extends Error {
    readonly code: CourseInvitationErrorCode;

    constructor(code: CourseInvitationErrorCode) {
        super(messages[code]);
        this.name = "CourseInvitationError";
        this.code = code;
    }
}
