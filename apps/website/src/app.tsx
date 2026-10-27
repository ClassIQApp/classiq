import { AuthProvider, useAuth } from "./api/auth/provider";
import { useCourses } from "./api/courses/use-courses";
import AppShell from "./components/layout/AppShell";
import type { NavItem } from "./components/layout/Sidebar";
import "./index.css";
import Login from "./pages/login";
import StudentCourses from "./pages/student/Courses";
import { useState } from "react";

function Account() {
    const { state, controller } = useAuth();
    const [activeNav, setActiveNav] = useState<NavItem>("Courses");
    const [loggingOut, setLoggingOut] = useState(false);
    const [logoutError, setLogoutError] = useState<string | null>(null);
    const { data: courses = [], isPending, isError, error, refetch } = useCourses();

    async function handleLogout() {
        if (loggingOut) {
            return;
        }

        setLoggingOut(true);
        setLogoutError(null);

        try {
            await controller.logout();

            setActiveNav("Courses");
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

    const user = state.user;

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

        if (isPending) {
            return <p role="status">Loading courses…</p>;
        }

        if (isError) {
            return (
                <div role="alert">
                    <p>{error.message}</p>
                    <button type="button" onClick={() => void refetch()}>
                        Retry
                    </button>
                </div>
            );
        }

        return <StudentCourses key={user.id} courses={courses} />;
    }

    return (
        <AppShell
            activeNav={activeNav}
            onNavigate={setActiveNav}
            role="account"
            user={state.user}
            onLogout={() => void handleLogout()}
            loggingOut={loggingOut}
        >
            {logoutError && <p role="alert">{logoutError}</p>}
            {showPage()}
        </AppShell>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <Account />
        </AuthProvider>
    );
}
