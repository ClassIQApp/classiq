import type { Course } from "../../api/courses/types";
import type { LectureStatus } from "../../api/lectures/types";
import LectureDetail from "../../components/lectures/lecture-detail";
import LectureList from "../../components/lectures/lecture-list";
import "./CourseLectures.css";
import CourseResources from "./CourseResources";
import { useEffect, useRef, useState } from "react";

export default function Courses({ courses = [] }: { courses?: Course[] }) {
    const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
    const [lectureId, setLectureId] = useState<string | null>(null);
    const [showResources, setShowResources] = useState(false);
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState<LectureStatus | "all">("all");
    const heading = useRef<HTMLHeadingElement>(null);
    const course = courses.find((item) => item.id === courseId) ?? courses[0];
    const lecture = course?.lectures.find((item) => item.id === lectureId);

    useEffect(() => {
        heading.current?.focus();
    }, [lectureId]);

    function changeCourse(id: string) {
        setCourseId(id);
        setLectureId(null);
        setQuery("");
        setStatus("all");
    }

    return (
        <div className="courses-page">
            <header className="courses-heading">
                <div className="courses-heading-top">
                    <div>
                        <p className="courses-eyebrow">My courses{course ? ` / ${course.code}` : ""}</p>
                        <h1 ref={heading} tabIndex={-1}>
                            {showResources ? "Course Resources" : lecture ? lecture.title : (course?.name ?? "My Courses")}
                        </h1>
                        <p>
                            {showResources
                                ? "Upload and view PDF lecture notes, assignments, or study guides."
                                : lecture
                                  ? "Review your lecture and the content available so far."
                                  : (course?.description ?? "Find your courses, lectures, and study content here.")}
                        </p>
                    </div>
                    <button onClick={() => setShowResources((current) => !current)} className="resources-toggle-btn" type="button">
                        {showResources ? "Back to Courses" : "Resources"}
                    </button>
                </div>
            </header>
            {showResources ? (
                <CourseResources />
            ) : lecture ? (
                <LectureDetail lecture={lecture} onBack={() => setLectureId(null)} />
            ) : (
                <LectureList
                    courses={courses}
                    course={course}
                    query={query}
                    status={status}
                    onCourseChange={changeCourse}
                    onQueryChange={setQuery}
                    onStatusChange={setStatus}
                    onOpenLecture={setLectureId}
                />
            )}
        </div>
    );
}
