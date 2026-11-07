import type { Course } from "../../api/courses/types";
import type { LectureStatus } from "../../api/lectures/types";
import type { AppRoute, CourseSection } from "../../navigation/route";
import ChatWindow from "../chat/chat-window";
import LectureDetail from "../lectures/lecture-detail";
import LectureList from "../lectures/lecture-list";
import type { LectureSort } from "../lectures/lecture-list";
import CourseResources from "./course-resources";
import CourseRoleBadge from "./course-role-badge";
import CourseSearch from "./course-search";
import CourseStudyGuides from "./course-study-guides";
import { ChatCircleDotsIcon, FilesIcon, MagnifyingGlassIcon, PresentationIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

export type CourseRoute = Extract<AppRoute, { name: "course" | "lecture" }>;

const sectionLabelBySection: Record<CourseSection, string> = {
    lectures: "Lectures",
    resources: "Resources",
    "study-guides": "Study Guides",
    chat: "Chat",
    search: "Search",
};

const iconBySection: Record<CourseSection, Icon> = {
    lectures: PresentationIcon,
    resources: FilesIcon,
    "study-guides": FilesIcon,
    search: MagnifyingGlassIcon,
    chat: ChatCircleDotsIcon,
};

const courseSections: CourseSection[] = ["lectures", "resources", "study-guides", "search", "chat"];

interface CourseWorkspaceProps {
    course: Course;
    courses: Course[];
    route: CourseRoute;
    onNavigate: (route: CourseRoute) => void;
    onCourseChange: (courseId: string) => void;
    onClose: () => void;
}

export default function CourseWorkspace({ course, courses, route, onNavigate, onCourseChange, onClose }: CourseWorkspaceProps) {
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState<LectureStatus | "all">("all");
    const [sort, setSort] = useState<LectureSort>("newest");

    const workspace = useRef<HTMLDivElement>(null);
    const heading = useRef<HTMLHeadingElement>(null);

    const lecture = route.name === "lecture" ? course.lectures.find((item) => item.id === route.lectureId) : undefined;

    const startSeconds = route.name === "lecture" ? route.startSeconds : undefined;

    const section: CourseSection = route.name === "lecture" ? "lectures" : route.section;

    const view = lecture ? "lecture" : section;

    const showSection = (name: CourseSection) =>
        onNavigate({
            name: "course",
            courseId: course.id,
            section: name,
        });

    const openLecture = (lectureId: string, seconds?: number) =>
        onNavigate({
            name: "lecture",
            courseId: course.id,
            lectureId,
            startSeconds: seconds,
        });

    useEffect(() => {
        workspace.current?.scrollIntoView({
            block: "start",
        });

        heading.current?.focus({
            preventScroll: true,
        });
    }, [view]);

    function showContent() {
        if (view === "resources") {
            return <CourseResources courseId={course.id} lectures={course.lectures} canManage={course.role === "teacher"} />;
        }

        if (view === "study-guides") {
            return (
                <CourseStudyGuides
                    courseId={course.id}
                    lectures={course.lectures}
                    canManage={course.role === "teacher"}
                    onOpenLecture={openLecture}
                />
            );
        }

        if (view === "search") {
            return <CourseSearch courseId={course.id} lectures={course.lectures} onOpenLecture={openLecture} />;
        }

        if (view === "chat") {
            return (
                <ChatWindow
                /* courseCode={course.code} courseName={course.name} */
                />
            );

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
                    onBack={() => showSection("lectures")}
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
                onOpenLecture={(lectureId) => openLecture(lectureId)}
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
                    {courseSections.map((item) => {
                        const SectionIcon = iconBySection[item];

                        const active = section === item;

                        return (
                            <button
                                key={item}
                                type="button"
                                className="course-section-button"
                                aria-current={active ? "page" : undefined}
                                onClick={() => showSection(item)}
                            >
                                <SectionIcon className="course-section-icon" weight={active ? "fill" : "regular"} aria-hidden />

                                {sectionLabelBySection[item]}
                            </button>
                        );
                    })}
                </nav>
            </header>

            {showContent()}
        </div>
    );
}
