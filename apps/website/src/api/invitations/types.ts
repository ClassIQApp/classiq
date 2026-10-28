import type { CourseRole } from "../courses/types";

export type InvitationStatus = "pending" | "accepted";

export interface Invitation {
    id: string;
    courseId: string;
    courseName: string;
    email: string;
    status: InvitationStatus;
    createdAt: string;
}

export interface ListInvitationsResponse {
    items: Invitation[];
}

export interface InvitationAcceptance {
    courseId: string;
    role: CourseRole;
}
