import { useTranslation } from "../../i18n/use-translation";
import { ChalkboardTeacherIcon, GraduationCapIcon } from "@phosphor-icons/react";

type TopBarProps = {
    role: "teacher" | "student" | "account";
    user?: {
        name: string;
        email: string;
    };
    loggingOut?: boolean;
    onLogout: () => void;
};

export default function TopBar({ role, onLogout, user, loggingOut }: TopBarProps) {
    const { t } = useTranslation();

    const ModeIcon = role === "teacher" ? ChalkboardTeacherIcon : GraduationCapIcon;

    const displayName = user?.name || user?.email || "";

    const labelByRole = {
        teacher: t("topbar.instructorMode"),
        student: t("topbar.studentMode"),
        account: displayName,
    };

    const fallbackInitialByRole = {
        teacher: "T",
        student: "S",
        account: "",
    };

    const avatarInitial = displayName.trim().slice(0, 1).toUpperCase() || fallbackInitialByRole[role];

    return (
        <header className="main-header">
            <div className="header-right">
                <span className="mode-label">
                    {role !== "account" && <ModeIcon className="mode-icon" aria-hidden />}

                    {labelByRole[role]}
                </span>

                <div className="header-divider" aria-hidden />

                <div className="profile">
                    <div className="avatar" aria-hidden>
                        {avatarInitial}
                    </div>
                </div>

                <button type="button" className="logout-button" onClick={onLogout} disabled={loggingOut}>
                    {loggingOut ? t("topbar.loggingOut") : t("topbar.logout")}
                </button>
            </div>
        </header>
    );
}
