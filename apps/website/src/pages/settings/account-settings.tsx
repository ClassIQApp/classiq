import { ApiError, createAuthApi } from "../../api/auth/client";
import type { AuthUser } from "../../api/auth/client";
import { useAuth } from "../../api/auth/provider";
import "./account-settings.css";
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
            setProfileError("Enter your first name.");

            return;
        }

        if (!cleanLastName) {
            setProfileError("Enter your last name.");

            return;
        }

        setSavingProfile(true);

        try {
            await onUpdateProfile(cleanFirstName, cleanLastName);

            setProfileSuccess("Your profile has been updated.");
        } catch (error) {
            setProfileError(
                error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Could not update your profile.",
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
            setPasswordError("Enter your current password.");

            return;
        }

        if (newPassword.length < 8) {
            setPasswordError("Your new password must be at least 8 characters.");

            return;
        }

        if (newPassword.length > 128) {
            setPasswordError("Your new password must be 128 characters or fewer.");

            return;
        }

        if (newPassword !== confirmPassword) {
            setPasswordError("The new passwords do not match.");

            return;
        }

        if (newPassword === currentPassword) {
            setPasswordError("Your new password must be different from your current password.");

            return;
        }

        setChangingPassword(true);

        try {
            await onChangePassword(currentPassword, newPassword);

            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");

            setPasswordSuccess("Your password has been changed.");
        } catch (error) {
            setPasswordError(
                error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Could not change your password.",
            );
        } finally {
            setChangingPassword(false);
        }
    }

    return (
        <section className="account-settings-page">
            <button type="button" className="settings-back-button" onClick={onBack}>
                ← Back to Settings
            </button>

            <header className="account-settings-header">
                <p className="account-settings-eyebrow">Account</p>

                <h1>Account Settings</h1>

                <p className="account-settings-description">Manage your personal information and account security.</p>
            </header>

            <div className="account-settings-list">
                <section className="account-settings-section">
                    <div className="account-settings-section-title">
                        <h2>Profile</h2>
                    </div>

                    <form className="account-settings-form" onSubmit={(event) => void saveProfile(event)}>
                        <div className="account-setting-row">
                            <div className="account-setting-copy">
                                <h3>Name</h3>

                                <p>This is the name shown throughout ClassIQ.</p>
                            </div>

                            <div className="account-name-fields">
                                <label>
                                    <span>First name</span>

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
                                    <span>Last name</span>

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
                                <h3>Email address</h3>

                                <p>The email used to sign in to your account.</p>
                            </div>

                            <div className="account-email-field">
                                <input type="email" value={user.email} readOnly disabled aria-label="Email address" />

                                <small>Email changes are not available yet.</small>
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
                                {savingProfile ? "Saving..." : "Save changes"}
                            </button>
                        </div>
                    </form>
                </section>

                <section className="account-settings-section">
                    <div className="account-settings-section-title">
                        <h2>Security</h2>
                    </div>

                    <form className="account-settings-form" onSubmit={(event) => void changePassword(event)}>
                        <div className="account-password-fields">
                            <div className="account-setting-copy">
                                <h3>Change password</h3>

                                <p>Update the password you use to sign in to ClassIQ.</p>
                            </div>

                            <div className="account-password-form">
                                <label>
                                    <span>Current password</span>

                                    <input
                                        type="password"
                                        value={currentPassword}
                                        autoComplete="current-password"
                                        disabled={changingPassword}
                                        onChange={(event) => setCurrentPassword(event.target.value)}
                                    />
                                </label>

                                <label>
                                    <span>New password</span>

                                    <input
                                        type="password"
                                        value={newPassword}
                                        autoComplete="new-password"
                                        minLength={8}
                                        maxLength={128}
                                        disabled={changingPassword}
                                        onChange={(event) => setNewPassword(event.target.value)}
                                    />

                                    <small>Use at least 8 characters.</small>
                                </label>

                                <label>
                                    <span>Confirm new password</span>

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
                                {changingPassword ? "Changing..." : "Change password"}
                            </button>
                        </div>
                    </form>
                </section>
            </div>
        </section>
    );
}
