import { ApiError, createAuthApi } from "../../api/auth/client";
import type { AuthUser } from "../../api/auth/client";
import { useAuth } from "../../api/auth/provider";
import { useTranslation } from "../../i18n/use-translation";
import "./account-settings.css";
import type { InterfaceLanguage } from "./language-preferences";
import { useMemo, useState } from "react";

interface AccountSettingsProps {
    onBack: () => void;
}

interface AccountSettingsContentProps {
    user: AuthUser;
    fallbackFirstName: string;
    fallbackLastName: string;
    onBack: () => void;
    onUpdateProfile: (firstName: string, lastName: string) => Promise<void>;
    onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

interface AccountMessages {
    enterFirstName: string;
    enterLastName: string;
    profileUpdated: string;
    profileUpdateFailed: string;
    enterCurrentPassword: string;
    passwordTooShort: string;
    passwordTooLong: string;
    passwordsDoNotMatch: string;
    passwordMustBeDifferent: string;
    passwordChanged: string;
    passwordChangeFailed: string;
}

const messagesByLanguage: Record<InterfaceLanguage, AccountMessages> = {
    en: {
        enterFirstName: "Enter your first name.",
        enterLastName: "Enter your last name.",
        profileUpdated: "Your profile has been updated.",
        profileUpdateFailed: "Could not update your profile.",
        enterCurrentPassword: "Enter your current password.",
        passwordTooShort: "Your new password must be at least 8 characters.",
        passwordTooLong: "Your new password must be 128 characters or fewer.",
        passwordsDoNotMatch: "The new passwords do not match.",
        passwordMustBeDifferent: "Your new password must be different from your current password.",
        passwordChanged: "Your password has been changed.",
        passwordChangeFailed: "Could not change your password.",
    },

    es: {
        enterFirstName: "Ingresa tu nombre.",
        enterLastName: "Ingresa tu apellido.",
        profileUpdated: "Tu perfil ha sido actualizado.",
        profileUpdateFailed: "No se pudo actualizar tu perfil.",
        enterCurrentPassword: "Ingresa tu contraseña actual.",
        passwordTooShort: "Tu nueva contraseña debe tener al menos 8 caracteres.",
        passwordTooLong: "Tu nueva contraseña debe tener 128 caracteres o menos.",
        passwordsDoNotMatch: "Las nuevas contraseñas no coinciden.",
        passwordMustBeDifferent: "Tu nueva contraseña debe ser diferente de tu contraseña actual.",
        passwordChanged: "Tu contraseña ha sido cambiada.",
        passwordChangeFailed: "No se pudo cambiar tu contraseña.",
    },

    ar: {
        enterFirstName: "أدخل اسمك الأول.",
        enterLastName: "أدخل اسم العائلة.",
        profileUpdated: "تم تحديث ملفك الشخصي.",
        profileUpdateFailed: "تعذر تحديث ملفك الشخصي.",
        enterCurrentPassword: "أدخل كلمة المرور الحالية.",
        passwordTooShort: "يجب أن تتكون كلمة المرور الجديدة من 8 أحرف على الأقل.",
        passwordTooLong: "يجب ألا تتجاوز كلمة المرور الجديدة 128 حرفًا.",
        passwordsDoNotMatch: "كلمتا المرور الجديدتان غير متطابقتين.",
        passwordMustBeDifferent: "يجب أن تكون كلمة المرور الجديدة مختلفة عن كلمة المرور الحالية.",
        passwordChanged: "تم تغيير كلمة المرور.",
        passwordChangeFailed: "تعذر تغيير كلمة المرور.",
    },

    de: {
        enterFirstName: "Gib deinen Vornamen ein.",
        enterLastName: "Gib deinen Nachnamen ein.",
        profileUpdated: "Dein Profil wurde aktualisiert.",
        profileUpdateFailed: "Dein Profil konnte nicht aktualisiert werden.",
        enterCurrentPassword: "Gib dein aktuelles Passwort ein.",
        passwordTooShort: "Dein neues Passwort muss mindestens 8 Zeichen lang sein.",
        passwordTooLong: "Dein neues Passwort darf höchstens 128 Zeichen lang sein.",
        passwordsDoNotMatch: "Die neuen Passwörter stimmen nicht überein.",
        passwordMustBeDifferent: "Dein neues Passwort muss sich vom aktuellen Passwort unterscheiden.",
        passwordChanged: "Dein Passwort wurde geändert.",
        passwordChangeFailed: "Dein Passwort konnte nicht geändert werden.",
    },

    fr: {
        enterFirstName: "Entrez votre prénom.",
        enterLastName: "Entrez votre nom de famille.",
        profileUpdated: "Votre profil a été mis à jour.",
        profileUpdateFailed: "Impossible de mettre à jour votre profil.",
        enterCurrentPassword: "Entrez votre mot de passe actuel.",
        passwordTooShort: "Votre nouveau mot de passe doit contenir au moins 8 caractères.",
        passwordTooLong: "Votre nouveau mot de passe doit contenir au maximum 128 caractères.",
        passwordsDoNotMatch: "Les nouveaux mots de passe ne correspondent pas.",
        passwordMustBeDifferent: "Votre nouveau mot de passe doit être différent de votre mot de passe actuel.",
        passwordChanged: "Votre mot de passe a été modifié.",
        passwordChangeFailed: "Impossible de modifier votre mot de passe.",
    },
};

function nameParts(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);

    return {
        firstName: parts[0] ?? "",
        lastName: parts.slice(1).join(" "),
    };
}

export default function AccountSettings({ onBack }: AccountSettingsProps) {
    const { state, controller, apiFetch } = useAuth();

    const authApi = useMemo(() => createAuthApi(apiFetch), [apiFetch]);

    if (state.status !== "authenticated") {
        return null;
    }

    const fallbackName = nameParts(state.user.name);

    return (
        <AccountSettingsContent
            key={`${state.user.id}:${state.user.name}`}
            user={state.user}
            fallbackFirstName={fallbackName.firstName}
            fallbackLastName={fallbackName.lastName}
            onBack={onBack}
            onUpdateProfile={async (firstName, lastName) => {
                await authApi.updateProfile({
                    firstName,
                    lastName,
                    name: `${firstName} ${lastName}`.trim(),
                });

                await controller.restore();
            }}
            onChangePassword={(currentPassword, newPassword) =>
                authApi.changePassword({
                    currentPassword,
                    newPassword,
                    revokeOtherSessions: true,
                })
            }
        />
    );
}

function AccountSettingsContent({
    user,
    fallbackFirstName,
    fallbackLastName,
    onBack,
    onUpdateProfile,
    onChangePassword,
}: AccountSettingsContentProps) {
    const { t, language } = useTranslation();

    const messages = messagesByLanguage[language];

    const [firstName, setFirstName] = useState(user.firstName?.trim() || fallbackFirstName);

    const [lastName, setLastName] = useState(user.lastName?.trim() || fallbackLastName);

    const [savingProfile, setSavingProfile] = useState(false);

    const [profileError, setProfileError] = useState("");

    const [profileSuccess, setProfileSuccess] = useState("");

    const [currentPassword, setCurrentPassword] = useState("");

    const [newPassword, setNewPassword] = useState("");

    const [confirmPassword, setConfirmPassword] = useState("");

    const [changingPassword, setChangingPassword] = useState(false);

    const [passwordError, setPasswordError] = useState("");

    const [passwordSuccess, setPasswordSuccess] = useState("");

    async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const cleanFirstName = firstName.trim();

        const cleanLastName = lastName.trim();

        setProfileError("");
        setProfileSuccess("");

        if (!cleanFirstName) {
            setProfileError(messages.enterFirstName);

            return;
        }

        if (!cleanLastName) {
            setProfileError(messages.enterLastName);

            return;
        }

        setSavingProfile(true);

        try {
            await onUpdateProfile(cleanFirstName, cleanLastName);

            setProfileSuccess(messages.profileUpdated);
        } catch (error) {
            setProfileError(
                error instanceof ApiError ? error.message : error instanceof Error ? error.message : messages.profileUpdateFailed,
            );
        } finally {
            setSavingProfile(false);
        }
    }

    async function changePassword(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setPasswordError("");
        setPasswordSuccess("");

        if (!currentPassword) {
            setPasswordError(messages.enterCurrentPassword);

            return;
        }

        if (newPassword.length < 8) {
            setPasswordError(messages.passwordTooShort);

            return;
        }

        if (newPassword.length > 128) {
            setPasswordError(messages.passwordTooLong);

            return;
        }

        if (newPassword !== confirmPassword) {
            setPasswordError(messages.passwordsDoNotMatch);

            return;
        }

        if (newPassword === currentPassword) {
            setPasswordError(messages.passwordMustBeDifferent);

            return;
        }

        setChangingPassword(true);

        try {
            await onChangePassword(currentPassword, newPassword);

            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");

            setPasswordSuccess(messages.passwordChanged);
        } catch (error) {
            setPasswordError(
                error instanceof ApiError ? error.message : error instanceof Error ? error.message : messages.passwordChangeFailed,
            );
        } finally {
            setChangingPassword(false);
        }
    }

    return (
        <section className="account-settings-page">
            <button type="button" className="settings-back-button" onClick={onBack}>
                {t("settings.back")}
            </button>

            <header className="account-settings-header">
                <p className="account-settings-eyebrow">{t("account.eyebrow")}</p>

                <h1>{t("account.title")}</h1>

                <p className="account-settings-description">{t("account.description")}</p>
            </header>

            <div className="account-settings-list">
                <section className="account-settings-section">
                    <div className="account-settings-section-title">
                        <h2>{t("account.profile")}</h2>
                    </div>

                    <form className="account-settings-form" onSubmit={(event) => void saveProfile(event)}>
                        <div className="account-setting-row">
                            <div className="account-setting-copy">
                                <h3>{t("account.name")}</h3>

                                <p>{t("account.nameDescription")}</p>
                            </div>

                            <div className="account-name-fields">
                                <label>
                                    <span>{t("account.firstName")}</span>

                                    <input
                                        type="text"
                                        value={firstName}
                                        autoComplete="given-name"
                                        maxLength={100}
                                        disabled={savingProfile}
                                        onChange={(event) => setFirstName(event.target.value)}
                                    />
                                </label>

                                <label>
                                    <span>{t("account.lastName")}</span>

                                    <input
                                        type="text"
                                        value={lastName}
                                        autoComplete="family-name"
                                        maxLength={100}
                                        disabled={savingProfile}
                                        onChange={(event) => setLastName(event.target.value)}
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="account-setting-row">
                            <div className="account-setting-copy">
                                <h3>{t("account.email")}</h3>

                                <p>{t("account.emailDescription")}</p>
                            </div>

                            <div className="account-email-field">
                                <input type="email" value={user.email} readOnly disabled aria-label={t("account.email")} />

                                <small>{t("account.emailUnavailable")}</small>
                            </div>
                        </div>

                        {profileError && (
                            <p className="account-settings-message account-settings-error" role="alert">
                                {profileError}
                            </p>
                        )}

                        {profileSuccess && (
                            <p className="account-settings-message account-settings-success" role="status">
                                {profileSuccess}
                            </p>
                        )}

                        <div className="account-settings-actions">
                            <button type="submit" disabled={savingProfile}>
                                {savingProfile ? t("account.saving") : t("account.saveChanges")}
                            </button>
                        </div>
                    </form>
                </section>

                <section className="account-settings-section">
                    <div className="account-settings-section-title">
                        <h2>{t("account.security")}</h2>
                    </div>

                    <form className="account-settings-form" onSubmit={(event) => void changePassword(event)}>
                        <div className="account-password-fields">
                            <div className="account-setting-copy">
                                <h3>{t("account.changePassword")}</h3>

                                <p>{t("account.passwordDescription")}</p>
                            </div>

                            <div className="account-password-form">
                                <label>
                                    <span>{t("account.currentPassword")}</span>

                                    <input
                                        type="password"
                                        value={currentPassword}
                                        autoComplete="current-password"
                                        disabled={changingPassword}
                                        onChange={(event) => setCurrentPassword(event.target.value)}
                                    />
                                </label>

                                <label>
                                    <span>{t("account.newPassword")}</span>

                                    <input
                                        type="password"
                                        value={newPassword}
                                        autoComplete="new-password"
                                        minLength={8}
                                        maxLength={128}
                                        disabled={changingPassword}
                                        onChange={(event) => setNewPassword(event.target.value)}
                                    />

                                    <small>{t("account.passwordHint")}</small>
                                </label>

                                <label>
                                    <span>{t("account.confirmPassword")}</span>

                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        autoComplete="new-password"
                                        minLength={8}
                                        maxLength={128}
                                        disabled={changingPassword}
                                        onChange={(event) => setConfirmPassword(event.target.value)}
                                    />
                                </label>
                            </div>
                        </div>

                        {passwordError && (
                            <p className="account-settings-message account-settings-error" role="alert">
                                {passwordError}
                            </p>
                        )}

                        {passwordSuccess && (
                            <p className="account-settings-message account-settings-success" role="status">
                                {passwordSuccess}
                            </p>
                        )}

                        <div className="account-settings-actions">
                            <button type="submit" disabled={changingPassword}>
                                {changingPassword ? t("account.changingPassword") : t("account.changePassword")}
                            </button>
                        </div>
                    </form>
                </section>
            </div>
        </section>
    );
}
