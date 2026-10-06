import AppShell from "./components/layout/AppShell";
import type { NavItem } from "./components/layout/Sidebar";
import "./index.css";
import Login from "./pages/login";
import StudentCourses from "./pages/student/Courses";
// Student pages
import StudentDashboard from "./pages/student/Dashboard";
import StudentMaterials from "./pages/student/Materials";
import StudentSettings from "./pages/student/Settings";
import TeacherCourses from "./pages/teacher/Courses";
// Teacher pages
import TeacherLiveLecture from "./pages/teacher/LiveLecture";
import TeacherMaterials from "./pages/teacher/Materials";
import TeacherSettings from "./pages/teacher/Settings";
import { useState } from "react";

type Role = "teacher" | "student";

function App() {
    const [role, setRole] = useState<Role | null>(null);

    const [activeNav, setActiveNav] = useState<NavItem>("Live Lecture");

    function handleLogin(email: string, password: string) {
        console.log("Temporary login:", email, password);

        // TEMPORARY until the real backend authentication is ready.
        // This lets us test both interfaces using one shared sign-in page.
        if (email.toLowerCase().includes("teacher")) {
            setRole("teacher");
            setActiveNav("Live Lecture");
        } else {
            setRole("student");
            setActiveNav("Dashboard");
        }
    }

    function handleLogout() {
        setRole(null);
        setActiveNav("Live Lecture");
    }

    if (!role) {
        return <Login onLogin={handleLogin} />;
    }

    function showPage() {
        if (role === "teacher") {
            if (activeNav === "Courses") {
                return <TeacherCourses />;
            }

            if (activeNav === "Materials") {
                return <TeacherMaterials />;
            }

            if (activeNav === "Settings") {
                return <TeacherSettings />;
            }

            return <TeacherLiveLecture />;
        }

        if (activeNav === "Courses") {
            return <StudentCourses />;
        }

        if (activeNav === "Materials") {
            return <StudentMaterials />;
        }

        if (activeNav === "Settings") {
            return <StudentSettings />;
        }

        return <StudentDashboard />;
    }

    return (
        <AppShell activeNav={activeNav} onNavigate={setActiveNav} role={role} onLogout={handleLogout}>
            {showPage()}
        </AppShell>
    );
}

export default App;
