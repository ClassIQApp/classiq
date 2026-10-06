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
                        <span className="nav-icon">▷</span>
                        <span>Live Lecture</span>
                    </button>
                ) : (
                    <button className={`nav-item ${activeNav === "Dashboard" ? "active" : ""}`} onClick={() => onNavigate("Dashboard")}>
                        <span className="nav-icon">□</span>
                        <span>Dashboard</span>
                    </button>
                )}

                <button className={`nav-item ${activeNav === "Courses" ? "active" : ""}`} onClick={() => onNavigate("Courses")}>
                    <span className="nav-icon">□</span>
                    <span>Courses</span>
                </button>

                <button className={`nav-item ${activeNav === "Materials" ? "active" : ""}`} onClick={() => onNavigate("Materials")}>
                    <span className="nav-icon">▤</span>
                    <span>Materials</span>
                </button>

                <button className={`nav-item ${activeNav === "Settings" ? "active" : ""}`} onClick={() => onNavigate("Settings")}>
                    <span className="nav-icon">⚙</span>
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
