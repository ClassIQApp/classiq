import LectureDetail from "../../components/lectures/lecture-detail";
import LectureList from "../../components/lectures/lecture-list";
import type { Course, LectureStatus } from "../../types/lecture";
import "./courses.css";
import { useEffect, useRef, useState } from "react";

// Supply courses here once the course and lecture API is connected.
export default function Courses({ courses = [] }: { courses?: Course[] }) {
    const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
    const [lectureId, setLectureId] = useState<string | null>(null);
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
                <p className="courses-eyebrow">My courses{course ? ` / ${course.code}` : ""}</p>
                <h1 ref={heading} tabIndex={-1}>
                    {lecture ? lecture.title : (course?.name ?? "My Courses")}
                </h1>
                <p>
                    {lecture
                        ? "Review your lecture and the content available so far."
                        : (course?.description ?? "Find your courses, lectures, and study content here.")}
                </p>
            </header>
            {lecture ? (
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
