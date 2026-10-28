import { ApiError } from "../../api/auth/client";
import { useInviteToCourse } from "../../api/invitations/use-invitations";
import "./invitations.css";
import InviteEmailForm, { validateInvitationEmail } from "./invite-email-form";
import type { InviteEmailFormState } from "./invite-email-form";
import { useState } from "react";

interface InviteFormProps {
    courseId: string;
}

export default function InviteForm({ courseId }: InviteFormProps) {
    const [email, setEmail] = useState("");
    const [validationError, setValidationError] = useState<string | null>(null);
    const invitation = useInviteToCourse(courseId);

    function handleEmailChange(value: string) {
        setEmail(value);
        setValidationError(null);
        invitation.reset();
    }

    function handleSubmit() {
        const error = validateInvitationEmail(email);

        setValidationError(error);

        if (error) {
            return;
        }

        invitation.mutate(email.trim(), { onSuccess: () => setEmail("") });
    }

    let state: InviteEmailFormState = { status: "editing" };

    if (validationError) {
        state = { status: "failed", message: validationError };
    } else if (invitation.isPending) {
        state = { status: "sending" };
    } else if (invitation.isError) {
        state = {
            status: "failed",
            message: invitation.error instanceof ApiError ? invitation.error.message : "Could not send the invitation. Please try again.",
        };
    } else if (invitation.isSuccess) {
        state = { status: "sent", email: invitation.data.email };
    }

    return <InviteEmailForm email={email} state={state} onEmailChange={handleEmailChange} onSubmit={handleSubmit} />;
}
