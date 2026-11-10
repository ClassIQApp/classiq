import type { AuthUser } from "./api/auth/client";
import { AuthProvider, useAuth } from "./api/auth/provider";
import "./components/chat/chat-window.css";
import InviteForm from "./components/invitations/InviteForm";
import PendingInvitations from "./components/invitations/PendingInvitations";
import AppShell from "./components/layout/AppShell";
import type { NavItem } from "./components/layout/Sidebar";
import "./components/lectures/lecture-upload-form.css";
import "./index.css";
import { useRoute } from "./navigation/route";
import CoursePage from "./pages/courses/course-page";
import Login from "./pages/login";
import Courses from "./pages/teacher/Courses";
import "./styles/controls.css";
import { useState } from "react";

interface AccountHomeProps {
    user: AuthUser;
    loggingOut: boolean;
    logoutError: string | null;
    onLogout: () => void;
}

function AccountHome({ user, loggingOut, logoutError, onLogout }: AccountHomeProps) {
    const [route, go] = useRoute();
    const activeNav: NavItem = route.name === "settings" ? "Settings" : "Courses";

    function navigateTo(item: NavItem) {
        go(item === "Settings" ? { name: "settings" } : { name: "courses" });
    }

    function showPage() {
        if (route.name === "settings") {
            return (
                <section>
                    <h1>Account Settings</h1>
                    <p>{user.name}</p>
                    <p>{user.email}</p>
                </section>
            );
        }

        if (route.name === "course" || route.name === "lecture") {
            return (
                <CoursePage
                    courseId={route.courseId}
                    route={route}
                    onNavigate={go}
                    onCourseChange={(courseId) => go({ name: "course", courseId, section: "lectures" })}
                    onClose={() => go({ name: "courses" })}
                />
            );
        }

        return (
            <Courses
                onOpenCourse={(courseId) => go({ name: "course", courseId, section: "lectures" })}
                pendingInvitations={<PendingInvitations />}
                renderInviteForm={(courseId) => <InviteForm courseId={courseId} />}
            />
        );
    }

    return (
        <AppShell
            activeNav={activeNav}
            onNavigate={navigateTo}
            role="account"
            user={user}
            onLogout={onLogout}
            loggingOut={loggingOut}
            viewKey={route.name === "course" || route.name === "lecture" ? `course:${route.courseId}` : route.name}
        >
            {logoutError && <p role="alert">{logoutError}</p>}
            {showPage()}
        </AppShell>
    );
}

function Account() {
    const { state, controller } = useAuth();
    const [loggingOut, setLoggingOut] = useState(false);
    const [logoutError, setLogoutError] = useState<string | null>(null);

    async function handleLogout() {
        if (loggingOut) {
            return;
        }

        setLoggingOut(true);
        setLogoutError(null);

        try {
            await controller.logout();
        } catch (error) {
            setLogoutError(error instanceof Error ? error.message : "Could not log out. Please try again.");
        } finally {
            setLoggingOut(false);
        }
    }

    if (state.status === "loading") {
        return (
            <p className="auth-status" role="status">
                Restoring your session…
            </p>
        );
    }

    if (state.status === "error") {
        return (
            <div className="auth-status" role="alert">
                <p>{state.message}</p>
                <button type="button" onClick={() => void controller.restore()}>
                    Retry
                </button>
            </div>
        );
    }

    if (state.status === "anonymous") {
        return <Login onAuthenticate={(input) => controller.authenticate(input)} />;
    }

    return (
        <AccountHome
            key={state.user.id}
            user={state.user}
            loggingOut={loggingOut}
            logoutError={logoutError}
            onLogout={() => void handleLogout()}
        />
    );
}

export default function App() {
    return (
        <AuthProvider>
            <Account />
        </AuthProvider>
    );
}
