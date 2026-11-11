import { useCallback, useSyncExternalStore } from "react";

export type CourseSection = "lectures" | "resources" | "study-guides" | "search" | "chat";

export type AppRoute =
    | { name: "courses" }
    | { name: "settings" }
    | { name: "account-settings" }
    | { name: "accessibility-settings" }
    | { name: "language-settings" }
    | {
          name: "course";
          courseId: string;
          section: CourseSection;
      }
    | {
          name: "lecture";
          courseId: string;
          lectureId: string;
          startSeconds?: number;
      };

export interface NavigateOptions {
    replace?: boolean;
}

const courseSections: ReadonlySet<string> = new Set<CourseSection>(["lectures", "resources", "study-guides", "search", "chat"]);

const NAVIGATION_EVENT = "classiq:navigate";

function isCourseSection(value: string | undefined): value is CourseSection {
    return value !== undefined && courseSections.has(value);
}

function readStartSeconds(search: string): number | undefined {
    const value = Number(new URLSearchParams(search).get("t"));

    return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function parseRoute(pathname: string, search = ""): AppRoute {
    const [first, second, third, fourth, ...rest] = pathname.split("/").filter(Boolean);

    if (first === "settings") {
        if (!second) {
            return { name: "settings" };
        }

        if (second === "account" && !third) {
            return {
                name: "account-settings",
            };
        }

        if (second === "accessibility" && !third) {
            return {
                name: "accessibility-settings",
            };
        }

        if (second === "language" && !third) {
            return {
                name: "language-settings",
            };
        }

        return { name: "settings" };
    }

    if (first !== "courses" || !second) {
        return { name: "courses" };
    }

    const courseId = second;
    const section = third;
    const lectureId = fourth;

    if (section === "lectures" && lectureId && rest.length === 0) {
        return {
            name: "lecture",
            courseId,
            lectureId,
            startSeconds: readStartSeconds(search),
        };
    }

    if (section === undefined) {
        return {
            name: "course",
            courseId,
            section: "lectures",
        };
    }

    if (isCourseSection(section) && lectureId === undefined) {
        return {
            name: "course",
            courseId,
            section,
        };
    }

    return {
        name: "course",
        courseId,
        section: "lectures",
    };
}

export function routeUrl(route: AppRoute): string {
    switch (route.name) {
        case "courses":
            return "/";

        case "settings":
            return "/settings";

        case "account-settings":
            return "/settings/account";

        case "accessibility-settings":
            return "/settings/accessibility";

        case "language-settings":
            return "/settings/language";

        case "course": {
            const course = `/courses/${encodeURIComponent(route.courseId)}`;

            return route.section === "lectures" ? course : `${course}/${route.section}`;
        }

        case "lecture": {
            const lecture = `/courses/${encodeURIComponent(route.courseId)}/lectures/${encodeURIComponent(route.lectureId)}`;

            return route.startSeconds === undefined ? lecture : `${lecture}?t=${Math.floor(route.startSeconds)}`;
        }
    }
}

export function navigate(route: AppRoute, options: NavigateOptions = {}) {
    const url = routeUrl(route);

    if (url === `${location.pathname}${location.search}`) {
        return;
    }

    if (options.replace) {
        history.replaceState(null, "", url);
    } else {
        history.pushState(null, "", url);
    }

    globalThis.dispatchEvent(new Event(NAVIGATION_EVENT));
}

function subscribe(onChange: () => void) {
    globalThis.addEventListener("popstate", onChange);

    globalThis.addEventListener(NAVIGATION_EVENT, onChange);

    return () => {
        globalThis.removeEventListener("popstate", onChange);

        globalThis.removeEventListener(NAVIGATION_EVENT, onChange);
    };
}

const currentUrl = () => `${location.pathname}${location.search}`;

export function useRoute(): [AppRoute, typeof navigate] {
    const url = useSyncExternalStore(subscribe, currentUrl, () => "/");

    const query = url.indexOf("?");
    const go = useCallback(navigate, []);

    return [query === -1 ? parseRoute(url) : parseRoute(url.slice(0, query), url.slice(query)), go];
}
