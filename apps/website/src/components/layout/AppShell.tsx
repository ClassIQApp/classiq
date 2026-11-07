import Sidebar from "./Sidebar";
import type { NavItem } from "./Sidebar";
import TopBar from "./TopBar";
import "./layout.css";
import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";

interface AppShellProps {
    children: ReactNode;
    activeNav: NavItem;
    onNavigate: (item: NavItem) => void;
    role: "teacher" | "student" | "account";
    user?: { name: string; email: string };
    loggingOut?: boolean;
    onLogout: () => void;
    viewKey?: string;
}

export default function AppShell({ children, activeNav, onNavigate, role, onLogout, user, loggingOut, viewKey }: AppShellProps) {
    const content = useRef<HTMLElement>(null);

    useLayoutEffect(() => {
        content.current?.scrollTo({ top: 0 });
    }, [viewKey]);

    return (
        <div className="app-shell">
            <Sidebar activeNav={activeNav} onNavigate={onNavigate} role={role} />

            <div className="app-area">
                <TopBar role={role} user={user} onLogout={onLogout} loggingOut={loggingOut} />

                <main ref={content} className="main-content">
                    {children}
                </main>
            </div>
        </div>
    );
}
