import Sidebar from "./Sidebar";
import type { NavItem } from "./Sidebar";
import TopBar from "./TopBar";
import "./layout.css";
import type { ReactNode } from "react";

type AppShellProps = {
    children: ReactNode;
    activeNav: NavItem;
    onNavigate: (item: NavItem) => void;
    role: "teacher" | "student";
    onLogout: () => void;
};

export default function AppShell({ children, activeNav, onNavigate, role, onLogout }: AppShellProps) {
    return (
        <div className="app-shell">
            <Sidebar activeNav={activeNav} onNavigate={onNavigate} role={role} />

            <div className="app-area">
                <TopBar role={role} onLogout={onLogout} />

                <main className="main-content">{children}</main>
            </div>
        </div>
    );
}
