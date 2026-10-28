import type { Course } from "../../api/courses/types";
import type { LectureStatus } from "../../api/lectures/types";
import LectureDetail from "../lectures/lecture-detail";
import LectureList from "../lectures/lecture-list";
import CourseResources from "./course-resources";
import CourseRoleBadge from "./course-role-badge";
import { useEffect, useRef, useState } from "react";

type CourseSection = "lectures" | "resources";

type CourseView = { name: CourseSection } | { name: "lecture"; lectureId: string };

const sectionLabelBySection: Record<CourseSection, string> = {
    lectures: "Lectures",
    resources: "Resources",
};

const courseSections: CourseSection[] = ["lectures", "resources"];

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

    const heading = useRef<HTMLHeadingElement>(null);

    const lecture = view.name === "lecture" ? course.lectures.find((item) => item.id === view.lectureId) : undefined;
    const activeSection = view.name === "lecture" ? "lectures" : view.name;

    useEffect(() => {
        heading.current?.focus();
    }, [view.name]);

    function showContent() {
        if (view.name === "resources") {
            return <CourseResources canManage={course.role === "teacher"} />;
        }

        if (lecture) {
            return <LectureDetail lecture={lecture} onBack={() => setView({ name: "lectures" })} />;
        }

        return (
            <LectureList
                courses={courses}
                course={course}
                query={query}
                status={status}
                onCourseChange={onCourseChange}
                onQueryChange={setQuery}
                onStatusChange={setStatus}
                onOpenLecture={(lectureId) => setView({ name: "lecture", lectureId })}
            />
        );
    }

    return (
        <div className="courses-page">
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
                <p>{lecture ? "Review your lecture and the content available so far." : course.description}</p>
                <nav className="course-sections" aria-label="Course sections">
                    {courseSections.map((section) => (
                        <button
                            key={section}
                            type="button"
                            className="course-section-button"
                            aria-current={activeSection === section ? "page" : undefined}
                            onClick={() => setView({ name: section })}
                        >
                            {sectionLabelBySection[section]}
                        </button>
                    ))}
                </nav>
            </header>
            {showContent()}
        </div>
    );
}
