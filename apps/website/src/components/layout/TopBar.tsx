import { ChalkboardTeacherIcon, GraduationCapIcon } from "@phosphor-icons/react";

type TopBarProps = {
    role: "teacher" | "student" | "account";
    user?: { name: string; email: string };
    loggingOut?: boolean;
    onLogout: () => void;
};

export default function TopBar({ role, onLogout, user, loggingOut }: TopBarProps) {
    const ModeIcon = role === "teacher" ? ChalkboardTeacherIcon : GraduationCapIcon;
    const labelByRole = {
        teacher: "Instructor Mode",
        student: "Student Mode",
        account: user?.name || user?.email,
    };
    const avatarByRole = {
        teacher: "T",
        student: "S",
        account: (user?.name || user?.email || "").slice(0, 1).toUpperCase(),
    };

    return (
        <header className="main-header">
            <div></div>

            <div className="header-right">
                <span className="mode-label">
                    {role !== "account" && <ModeIcon className="mode-icon" aria-hidden />}
                    {labelByRole[role]}
                </span>

                <div className="header-divider" />

                <div className="profile">
                    <div className="avatar">{avatarByRole[role]}</div>
                </div>

                <button className="logout-button" onClick={onLogout} disabled={loggingOut}>
                    {loggingOut ? "Logging out…" : "Log Out"}
                </button>
            </div>
        </header>
    );
}
