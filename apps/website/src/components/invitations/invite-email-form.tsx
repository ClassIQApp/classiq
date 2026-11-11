import { useTranslation } from "../../i18n/use-translation";
import type { InterfaceLanguage } from "../../pages/settings/language-preferences";
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

interface InviteEmailMessages {
    inviteByEmail: string;
    hint: string;
    emailRequired: string;
    invitationFailed: string;
    invitationSent: (email: string) => string;
    sending: string;
    sendInvitation: string;
}

const messagesByLanguage: Record<InterfaceLanguage, InviteEmailMessages> = {
    en: {
        inviteByEmail: "Invite by email",

        hint: "They must already have a ClassIQ account. They will join as a Member once they accept.",

        emailRequired: "Enter the email address of a registered ClassIQ account.",

        invitationFailed: "The invitation could not be sent. Please try again.",

        invitationSent: (email) => `Invitation sent to ${email}.`,

        sending: "Sending…",

        sendInvitation: "Send invitation",
    },

    es: {
        inviteByEmail: "Invitar por correo electrónico",

        hint: "La persona debe tener una cuenta de ClassIQ. Se unirá como miembro cuando acepte la invitación.",

        emailRequired: "Ingresa el correo electrónico de una cuenta registrada de ClassIQ.",

        invitationFailed: "No se pudo enviar la invitación. Inténtalo de nuevo.",

        invitationSent: (email) => `Invitación enviada a ${email}.`,

        sending: "Enviando…",

        sendInvitation: "Enviar invitación",
    },

    ar: {
        inviteByEmail: "دعوة عبر البريد الإلكتروني",

        hint: "يجب أن يكون لدى الشخص حساب ClassIQ مسبقًا. سينضم كعضو بعد قبول الدعوة.",

        emailRequired: "أدخل البريد الإلكتروني لحساب ClassIQ مسجل.",

        invitationFailed: "تعذر إرسال الدعوة. حاول مرة أخرى.",

        invitationSent: (email) => `تم إرسال الدعوة إلى ${email}.`,

        sending: "جارٍ الإرسال…",

        sendInvitation: "إرسال الدعوة",
    },

    de: {
        inviteByEmail: "Per E-Mail einladen",

        hint: "Die Person muss bereits ein ClassIQ-Konto haben. Nach Annahme der Einladung tritt sie als Mitglied bei.",

        emailRequired: "Gib die E-Mail-Adresse eines registrierten ClassIQ-Kontos ein.",

        invitationFailed: "Die Einladung konnte nicht gesendet werden. Versuche es erneut.",

        invitationSent: (email) => `Einladung an ${email} gesendet.`,

        sending: "Wird gesendet…",

        sendInvitation: "Einladung senden",
    },

    fr: {
        inviteByEmail: "Inviter par e-mail",

        hint: "La personne doit déjà avoir un compte ClassIQ. Elle rejoindra le cours en tant que membre après avoir accepté l’invitation.",

        emailRequired: "Entrez l’adresse e-mail d’un compte ClassIQ enregistré.",

        invitationFailed: "Impossible d’envoyer l’invitation. Réessayez.",

        invitationSent: (email) => `Invitation envoyée à ${email}.`,

        sending: "Envoi…",

        sendInvitation: "Envoyer l’invitation",
    },
};

export function validateInvitationEmail(email: string, language: InterfaceLanguage = "en"): string | null {
    if (email.trim().length === 0) {
        return messagesByLanguage[language].emailRequired;
    }

    return null;
}

export default function InviteEmailForm({ email, state, onEmailChange, onSubmit }: InviteEmailFormProps) {
    const { language } = useTranslation();

    const messages = messagesByLanguage[language];

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
                {messages.inviteByEmail}

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
                {messages.hint}
            </p>

            {state.status === "failed" && (
                <p className="invitations-error" role="alert">
                    {language === "en" ? state.message : messages.invitationFailed}
                </p>
            )}

            {state.status === "sent" && (
                <p className="invitations-success" role="status">
                    {messages.invitationSent(state.email)}
                </p>
            )}

            <button className="invitations-button" type="submit" disabled={sending}>
                {sending ? messages.sending : messages.sendInvitation}
            </button>
        </form>
    );
}
