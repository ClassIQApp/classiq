import type { FormEvent } from "react";

export type InviteEmailFormState =
    | {
          status: "editing";
      }
    | {
          status: "sending";
      }
    | {
          status: "failed";
          message: string;
      }
    | {
          status: "sent";
          email: string;
      };

interface InviteEmailFormProps {
    email: string;
    state: InviteEmailFormState;
    onEmailChange: (email: string) => void;
    onSubmit: () => void;
}

export function validateInvitationEmail(email: string): string | null {
    if (email.trim().length === 0) {
        return "Enter the email address of a registered ClassIQ account.";
    }

    return null;
}

export default function InviteEmailForm({ email, state, onEmailChange, onSubmit }: InviteEmailFormProps) {
    const sending = state.status === "sending";

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!sending) {
            onSubmit();
        }
    }

    return (
        <form className="invitations invite-form" onSubmit={handleSubmit} aria-busy={sending}>
            <label className="invite-form-label">
                Invite by email
                <input
                    name="email"
                    type="email"
                    autoComplete="off"
                    value={email}
                    onChange={(event) => onEmailChange(event.target.value)}
                    placeholder="student@example.com"
                    required
                    disabled={sending}
                    aria-invalid={state.status === "failed"}
                    aria-describedby="invite-form-hint"
                />
            </label>
            <p className="invitations-muted" id="invite-form-hint">
                They must already have a ClassIQ account. They will join as a Member once they accept.
            </p>
            {state.status === "failed" && (
                <p className="invitations-error" role="alert">
                    {state.message}
                </p>
            )}
            {state.status === "sent" && (
                <p className="invitations-success" role="status">
                    Invitation sent to {state.email}.
                </p>
            )}
            <button className="invitations-button" type="submit" disabled={sending}>
                {sending ? "Sending…" : "Send invitation"}
            </button>
        </form>
    );
}
