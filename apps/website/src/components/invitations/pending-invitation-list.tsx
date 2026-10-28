import type { Invitation } from "../../api/invitations/types";
import { EnvelopeSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";

export type PendingInvitationListState =
    | {
          status: "loading";
      }
    | {
          status: "error";
          message: string;
      }
    | {
          status: "ready";
          invitations: Invitation[];
      };

export type InvitationAcceptanceState =
    | {
          status: "idle";
      }
    | {
          status: "accepting";
          invitationId: string;
      }
    | {
          status: "failed";
          invitationId: string;
          message: string;
      }
    | {
          status: "joined";
          courseName: string;
      };

interface PendingInvitationListProps {
    list: PendingInvitationListState;
    acceptance: InvitationAcceptanceState;
    onRetry: () => void;
    onAccept: (invitation: Invitation) => void;
}

export default function PendingInvitationList({ list, acceptance, onRetry, onAccept }: PendingInvitationListProps) {
    if (list.status === "loading") {
        return (
            <section className="invitations" aria-labelledby="pending-invitations-heading" aria-busy>
                <h2 id="pending-invitations-heading" className="invitations-heading">
                    Invitations
                </h2>
                <p className="invitations-muted">Loading invitations…</p>
            </section>
        );
    }

    if (list.status === "error") {
        return (
            <section className="invitations" aria-labelledby="pending-invitations-heading">
                <h2 id="pending-invitations-heading" className="invitations-heading">
                    Invitations
                </h2>
                <p className="invitations-error" role="alert">
                    <WarningCircleIcon size={16} aria-hidden />
                    {list.message}
                </p>
                <button className="invitations-button invitations-button-secondary" type="button" onClick={onRetry}>
                    Retry
                </button>
            </section>
        );
    }

    if (list.invitations.length === 0 && acceptance.status !== "joined") {
        return null;
    }

    return (
        <section className="invitations" aria-labelledby="pending-invitations-heading">
            <h2 id="pending-invitations-heading" className="invitations-heading">
                Invitations
            </h2>
            {acceptance.status === "joined" && (
                <p className="invitations-success" role="status">
                    You joined {acceptance.courseName}.
                </p>
            )}
            <ul className="invitations-list" role="list">
                {list.invitations.map((invitation) => {
                    const accepting = acceptance.status === "accepting" && acceptance.invitationId === invitation.id;
                    const failed = acceptance.status === "failed" && acceptance.invitationId === invitation.id;

                    let actionLabel = "Accept";

                    if (accepting) {
                        actionLabel = "Joining…";
                    } else if (failed) {
                        actionLabel = "Try again";
                    }

                    return (
                        <li key={invitation.id} className="invitations-item">
                            <EnvelopeSimpleIcon size={20} aria-hidden />
                            <div className="invitations-item-body">
                                <p className="invitations-item-title">{invitation.courseName}</p>
                                <p className="invitations-muted">You have been invited to join this course.</p>
                                {failed && (
                                    <p className="invitations-error" role="alert">
                                        {acceptance.message}
                                    </p>
                                )}
                            </div>
                            <button
                                className="invitations-button"
                                type="button"
                                disabled={acceptance.status === "accepting"}
                                aria-label={`${actionLabel}: ${invitation.courseName}`}
                                onClick={() => onAccept(invitation)}
                            >
                                {actionLabel}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
