import type { Course } from "../../api/courses/types";
import type { LectureStatus } from "../../api/lectures/types";
import ChatWindow from "../chat/chat-window";
import LectureDetail from "../lectures/lecture-detail";
import LectureList from "../lectures/lecture-list";
import type { LectureSort } from "../lectures/lecture-list";
import CourseResources from "./course-resources";
import CourseRoleBadge from "./course-role-badge";
import CourseSearch from "./course-search";
import { FilesIcon, MagnifyingGlassIcon, PresentationIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

type CourseSection = "lectures" | "resources" | "search" | "chat";

type CourseView = { name: CourseSection } | { name: "lecture"; lectureId: string; startSeconds?: number };

const sectionLabelBySection: Record<CourseSection, string> = {
    lectures: "Lectures",
    resources: "Resources",
    chat: "Chat",
    search: "Search",
};

const iconBySection: Record<CourseSection, Icon> = {
    lectures: PresentationIcon,
    resources: FilesIcon,
    search: MagnifyingGlassIcon,
    chat: FilesIcon, // someone add a new icon for this
};

const courseSections: CourseSection[] = ["lectures", "resources", "search", "chat"];

interface CourseWorkspaceProps {
    course: Course;
    courses: Course[];
    onCourseChange: (courseId: string) => void;
    onClose: () => void;
}

export default function CourseWorkspace({ course, courses, onCourseChange, onClose }: CourseWorkspaceProps) {
    const [view, setView] = useState<CourseView>({ name: "lectures" });
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState<LectureStatus | "all">("all");
    const [sort, setSort] = useState<LectureSort>("newest");

    const workspace = useRef<HTMLDivElement>(null);
    const heading = useRef<HTMLHeadingElement>(null);

    const lecture = view.name === "lecture" ? course.lectures.find((item) => item.id === view.lectureId) : undefined;
    const startSeconds = view.name === "lecture" ? view.startSeconds : undefined;
    const activeSection = view.name === "lecture" ? "lectures" : view.name;

    useEffect(() => {
        workspace.current?.scrollIntoView({ block: "start" });
        heading.current?.focus({ preventScroll: true });
    }, [view.name]);

    function showContent() {
        if (view.name === "resources") {
            return <CourseResources courseId={course.id} lectures={course.lectures} canManage={course.role === "teacher"} />;
        }

        if (view.name === "search") {
            return (
                <CourseSearch
                    courseId={course.id}
                    lectures={course.lectures}
                    onOpenLecture={(lectureId, seconds) => setView({ name: "lecture", lectureId, startSeconds: seconds })}
                />
            );
        }

        if (view.name === "chat") {
            return <ChatWindow /* courseCode={course.code} courseName={course.name} */ />;
            // pass other params in if needed by the ai
        }

        if (lecture) {
            return (
                <LectureDetail
                    key={lecture.id}
                    courseId={course.id}
                    lecture={lecture}
                    role={course.role}
                    startSeconds={startSeconds}
                    onBack={() => setView({ name: "lectures" })}
                />
            );
        }

        return (
            <LectureList
                courses={courses}
                course={course}
                query={query}
                status={status}
                sort={sort}
                onCourseChange={onCourseChange}
                onQueryChange={setQuery}
                onStatusChange={setStatus}
                onSortChange={setSort}
                onOpenLecture={(lectureId) => setView({ name: "lecture", lectureId })}
            />
        );
    }

    return (
        <div ref={workspace} className="courses-page">
            <header className="courses-heading">
                <button type="button" className="lecture-text-button" onClick={onClose}>
                    ← All courses
                </button>
                <p className="courses-eyebrow">
                    My Courses / {course.code} <CourseRoleBadge role={course.role} />
                </p>
                <h1 ref={heading} tabIndex={-1}>
                    {lecture ? lecture.title : course.name}
                </h1>
                <p>{lecture ? lecture.description : course.description}</p>
                <nav className="course-sections" aria-label="Course sections">
                    {courseSections.map((section) => {
                        const SectionIcon = iconBySection[section];
                        const active = activeSection === section;

                        return (
                            <button
                                key={section}
                                type="button"
                                className="course-section-button"
                                aria-current={active ? "page" : undefined}
                                onClick={() => setView({ name: section })}
                            >
                                <SectionIcon className="course-section-icon" weight={active ? "fill" : "regular"} aria-hidden />
                                {sectionLabelBySection[section]}
                            </button>
                        );
                    })}
                </nav>
            </header>
            {showContent()}
        </div>
    );
}
