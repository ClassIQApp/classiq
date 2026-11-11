import { useTranslation } from "../../i18n/use-translation";
import { BookOpenIcon, BroadcastIcon, FileTextIcon, GearIcon, SquaresFourIcon } from "@phosphor-icons/react";

export type NavItem = "Live Lecture" | "Dashboard" | "Courses" | "Materials" | "Settings";

type SidebarProps = {
    activeNav: NavItem;
    onNavigate: (item: NavItem) => void;
    role: "teacher" | "student" | "account";
};

export default function Sidebar({ activeNav, onNavigate, role }: SidebarProps) {
    const { t } = useTranslation();

    const primaryNavigationByRole = {
        teacher: "Live Lecture",
        student: "Dashboard",
        account: null,
    } satisfies Record<SidebarProps["role"], NavItem | null>;

    const primaryNavigation = primaryNavigationByRole[role];

    const PrimaryIcon = role === "teacher" ? BroadcastIcon : SquaresFourIcon;

    const navigationLabels: Record<NavItem, string> = {
        "Live Lecture": t("nav.liveLecture"),
        Dashboard: t("nav.dashboard"),
        Courses: t("nav.courses"),
        Materials: t("nav.materials"),
        Settings: t("nav.settings"),
    };

    return (
        <aside className="sidebar">
            <div className="brand">
                <img src="/classiq-logo.png" alt="ClassIQ" className="sidebar-logo" />

                <div className="brand-title">ClassIQ</div>
            </div>

            <nav className="side-nav">
                {primaryNavigation && (
                    <button
                        className={`nav-item ${activeNav === primaryNavigation ? "active" : ""}`}
                        onClick={() => onNavigate(primaryNavigation)}
                    >
                        <PrimaryIcon className="nav-icon" aria-hidden />

                        <span>{navigationLabels[primaryNavigation]}</span>
                    </button>
                )}

                <button className={`nav-item ${activeNav === "Courses" ? "active" : ""}`} onClick={() => onNavigate("Courses")}>
                    <BookOpenIcon className="nav-icon" aria-hidden />

                    <span>{t("nav.courses")}</span>
                </button>

                {role !== "account" && (
                    <button className={`nav-item ${activeNav === "Materials" ? "active" : ""}`} onClick={() => onNavigate("Materials")}>
                        <FileTextIcon className="nav-icon" aria-hidden />

                        <span>{t("nav.materials")}</span>
                    </button>
                )}

                <button className={`nav-item ${activeNav === "Settings" ? "active" : ""}`} onClick={() => onNavigate("Settings")}>
                    <GearIcon className="nav-icon" aria-hidden />

                    <span>{t("nav.settings")}</span>
                </button>
            </nav>

            <div className="sidebar-footer">
                <div className="sidebar-rule" />

                <p>{t("sidebar.betterUnderstanding")}</p>

                <p>{t("sidebar.brighterFutures")}</p>
            </div>
        </aside>
    );
}
