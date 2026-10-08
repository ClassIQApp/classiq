import { ChalkboardTeacherIcon, GraduationCapIcon } from "@phosphor-icons/react";

type TopBarProps = {
    role: "teacher" | "student";
    onLogout: () => void;
};

export default function TopBar({ role, onLogout }: TopBarProps) {
    const ModeIcon = role === "teacher" ? ChalkboardTeacherIcon : GraduationCapIcon;

    return (
        <header className="main-header">
            <div></div>

            <div className="header-right">
                <span className="mode-label">
                    <ModeIcon className="mode-icon" aria-hidden />
                    {role === "teacher" ? "Instructor Mode" : "Student Mode"}
                </span>

                <div className="header-divider" />

                <div className="profile">
                    <div className="avatar">{role === "teacher" ? "T" : "S"}</div>
                </div>

                <button className="logout-button" onClick={onLogout}>
                    Log Out
                </button>
            </div>
        </header>
    );
}
