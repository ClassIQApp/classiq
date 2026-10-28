import { ApiError } from "../../api/auth/client";
import { useAcceptInvitation, usePendingInvitations } from "../../api/invitations/use-invitations";
import "./invitations.css";
import PendingInvitationList from "./pending-invitation-list";
import type { InvitationAcceptanceState, PendingInvitationListState } from "./pending-invitation-list";

function describeError(error: unknown, fallback: string): string {
    return error instanceof ApiError ? error.message : fallback;
}

export default function PendingInvitations() {
    const invitations = usePendingInvitations();
    const acceptance = useAcceptInvitation();

    let list: PendingInvitationListState;

    if (invitations.data) {
        list = { status: "ready", invitations: invitations.data };
    } else if (invitations.isFetching) {
        list = { status: "loading" };
    } else if (invitations.isError) {
        list = { status: "error", message: describeError(invitations.error, "Could not load your invitations. Please try again.") };
    } else {
        return null;
    }

    let acceptanceState: InvitationAcceptanceState = { status: "idle" };

    if (acceptance.variables && acceptance.isPending) {
        acceptanceState = { status: "accepting", invitationId: acceptance.variables.id };
    } else if (acceptance.variables && acceptance.isError) {
        acceptanceState = {
            status: "failed",
            invitationId: acceptance.variables.id,
            message: describeError(acceptance.error, "Could not accept the invitation. Please try again."),
        };
    } else if (acceptance.variables && acceptance.isSuccess) {
        acceptanceState = { status: "joined", courseName: acceptance.variables.courseName };
    }

    return (
        <PendingInvitationList
            list={list}
            acceptance={acceptanceState}
            onRetry={() => void invitations.refetch()}
            onAccept={(invitation) => acceptance.mutate(invitation)}
        />
    );
}
