import type { ApiFetch } from "../auth/client";
import type { Invitation, InvitationAcceptance, ListInvitationsResponse } from "./types";

export function createInvitationApi(request: ApiFetch) {
    async function listPending(signal?: AbortSignal): Promise<Invitation[]> {
        const response = await request("/invitations", { signal });

        const data: ListInvitationsResponse = await response.json();

        return data.items;
    }

    async function invite(courseId: string, email: string): Promise<Invitation> {
        const response = await request(`/courses/${encodeURIComponent(courseId)}/invitations`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        });

        const invitation: Invitation = await response.json();

        return invitation;
    }

    async function accept(invitationId: string): Promise<InvitationAcceptance> {
        const response = await request(`/invitations/${encodeURIComponent(invitationId)}/accept`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });

        const acceptance: InvitationAcceptance = await response.json();

        return acceptance;
    }

    return { listPending, invite, accept };
}

export type InvitationApi = ReturnType<typeof createInvitationApi>;
