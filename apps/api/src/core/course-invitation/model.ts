import type { CourseRole } from "../course-access/model.ts";
import * as z from "zod/mini";

export type CourseInvitationStatus = "pending" | "accepted";

export const invitationRequestSchema = z.strictObject({
    email: z.string().check(z.trim(), z.toLowerCase(), z.email()),
});
export type InvitationRequest = z.infer<typeof invitationRequestSchema>;

export interface CourseInvitation {
    id: string;
    courseId: string;
    courseName: string;
    email: string;
    status: CourseInvitationStatus;
    createdAt: string;
}

export interface CourseInvitationDraft {
    courseId: string;
    recipientId: string;
    invitedBy: string;
}

export interface CourseInvitationAcceptance {
    courseId: string;
    role: CourseRole;
}
