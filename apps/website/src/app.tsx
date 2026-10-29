import type { AuthUser } from "./api/auth/client";
import { AuthProvider, useAuth } from "./api/auth/provider";
import InviteForm from "./components/invitations/InviteForm";
import PendingInvitations from "./components/invitations/PendingInvitations";
import AppShell from "./components/layout/AppShell";
import type { NavItem } from "./components/layout/Sidebar";
import "./components/lectures/lecture-upload-form.css";
import "./index.css";
import CoursePage from "./pages/courses/course-page";
import Login from "./pages/login";
import Courses from "./pages/teacher/Courses";
import { useState } from "react";

interface AccountHomeProps {
    user: AuthUser;
    loggingOut: boolean;
    logoutError: string | null;
    onLogout: () => void;
}

function AccountHome({ user, loggingOut, logoutError, onLogout }: AccountHomeProps) {
    const [activeNav, setActiveNav] = useState<NavItem>("Courses");
    const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

    function navigate(item: NavItem) {
        if (item === "Courses" && activeNav === "Courses") {
            setSelectedCourseId(null);
        }

        setActiveNav(item);
    }

    function showPage() {
        if (activeNav === "Settings") {
            return (
                <section>
                    <h1>Account Settings</h1>
                    <p>{user.name}</p>
                    <p>{user.email}</p>
                </section>
            );
        }

        if (selectedCourseId) {
            return (
                <CoursePage courseId={selectedCourseId} onCourseChange={setSelectedCourseId} onClose={() => setSelectedCourseId(null)} />
            );
        }

        return (
            <Courses
                onOpenCourse={setSelectedCourseId}
                pendingInvitations={<PendingInvitations />}
                renderInviteForm={(courseId) => <InviteForm courseId={courseId} />}
            />
        );
    }

    return (
        <AppShell activeNav={activeNav} onNavigate={navigate} role="account" user={user} onLogout={onLogout} loggingOut={loggingOut}>
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
