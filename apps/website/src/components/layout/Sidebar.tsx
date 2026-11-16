import { useTranslation } from "../../i18n/use-translation";
import { BookOpenIcon, BroadcastIcon, FileTextIcon, GearIcon, SquaresFourIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

export type NavItem = "Live Lecture" | "Dashboard" | "Courses" | "Materials" | "Settings";

type SidebarProps = {
    activeNav: NavItem;
    onNavigate: (item: NavItem) => void;
    role: "teacher" | "student" | "account";
};

type NavigationItem = {
    id: NavItem;
    label: string;
    icon: Icon;
};

export default function Sidebar({ activeNav, onNavigate, role }: SidebarProps) {
    const { t } = useTranslation();

    const primaryNavigationByRole = {
        teacher: "Live Lecture",
        student: "Dashboard",
        account: null,
    } satisfies Record<SidebarProps["role"], NavItem | null>;

    const primaryNavigation = primaryNavigationByRole[role];

    const primaryIcon = role === "teacher" ? BroadcastIcon : SquaresFourIcon;

    const navigationLabels: Record<NavItem, string> = {
        "Live Lecture": t("nav.liveLecture"),
        Dashboard: t("nav.dashboard"),
        Courses: t("nav.courses"),
        Materials: t("nav.materials"),
        Settings: t("nav.settings"),
    };

    const navigationItems: NavigationItem[] = [];

    if (primaryNavigation) {
        navigationItems.push({
            id: primaryNavigation,
            label: navigationLabels[primaryNavigation],
            icon: primaryIcon,
        });
    }

    navigationItems.push({
        id: "Courses",
        label: navigationLabels.Courses,
        icon: BookOpenIcon,
    });

    if (role !== "account") {
        navigationItems.push({
            id: "Materials",
            label: navigationLabels.Materials,
            icon: FileTextIcon,
        });
    }

    navigationItems.push({
        id: "Settings",
        label: navigationLabels.Settings,
        icon: GearIcon,
    });

    return (
        <aside className="sidebar">
            <div className="brand">
                <img src="/classiq-logo.png" alt="" className="sidebar-logo" aria-hidden />

                <div className="brand-title">ClassIQ</div>
            </div>

            <nav className="side-nav" aria-label="Main navigation">
                {navigationItems.map((item) => {
                    const IconComponent = item.icon;

                    const isActive = activeNav === item.id;

                    return (
                        <button
                            key={item.id}
                            type="button"
                            className={`nav-item ${isActive ? "active" : ""}`}
                            aria-current={isActive ? "page" : undefined}
                            title={item.label}
                            onClick={() => onNavigate(item.id)}
                        >
                            <IconComponent className="nav-icon" aria-hidden />

                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </nav>

            <div className="sidebar-footer">
                <div className="sidebar-rule" aria-hidden />

                <p>{t("sidebar.betterUnderstanding")}</p>

                <p>{t("sidebar.brighterFutures")}</p>
            </div>
        </aside>
    );
}
