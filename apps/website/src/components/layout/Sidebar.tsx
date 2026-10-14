import { BookOpenIcon, BroadcastIcon, FileTextIcon, GearIcon, SquaresFourIcon } from "@phosphor-icons/react";

export type NavItem = "Live Lecture" | "Dashboard" | "Courses" | "Materials" | "Settings";

type SidebarProps = {
    activeNav: NavItem;
    onNavigate: (item: NavItem) => void;
    role: "teacher" | "student";
};

export default function Sidebar({ activeNav, onNavigate, role }: SidebarProps) {
    return (
        <aside className="sidebar">
            <div className="brand">
                <img src="/classiq-logo.png" alt="ClassIQ" className="sidebar-logo" />

                <div className="brand-title">ClassIQ</div>
            </div>

            <nav className="side-nav">
                {role === "teacher" ? (
                    <button
                        className={`nav-item ${activeNav === "Live Lecture" ? "active" : ""}`}
                        onClick={() => onNavigate("Live Lecture")}
                    >
                        <BroadcastIcon className="nav-icon" aria-hidden />
                        <span>Live Lecture</span>
                    </button>
                ) : (
                    <button className={`nav-item ${activeNav === "Dashboard" ? "active" : ""}`} onClick={() => onNavigate("Dashboard")}>
                        <SquaresFourIcon className="nav-icon" aria-hidden />
                        <span>Dashboard</span>
                    </button>
                )}

                <button className={`nav-item ${activeNav === "Courses" ? "active" : ""}`} onClick={() => onNavigate("Courses")}>
                    <BookOpenIcon className="nav-icon" aria-hidden />
                    <span>Courses</span>
                </button>

                <button className={`nav-item ${activeNav === "Materials" ? "active" : ""}`} onClick={() => onNavigate("Materials")}>
                    <FileTextIcon className="nav-icon" aria-hidden />
                    <span>Materials</span>
                </button>

                <button className={`nav-item ${activeNav === "Settings" ? "active" : ""}`} onClick={() => onNavigate("Settings")}>
                    <GearIcon className="nav-icon" aria-hidden />
                    <span>Settings</span>
                </button>
            </nav>

            <div className="sidebar-footer">
                <div className="sidebar-rule" />
                <p>Better understanding.</p>
                <p>Brighter futures.</p>
            </div>
        </aside>
    );
}
