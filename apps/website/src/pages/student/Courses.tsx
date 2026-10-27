import type { Course } from "../../api/courses/types";
import type { LectureStatus } from "../../api/lectures/types";
import LectureDetail from "../../components/lectures/lecture-detail";
import LectureList from "../../components/lectures/lecture-list";
import "./CourseLectures.css";
import CourseResources from "./CourseResources";
import { ArrowRightIcon, BookOpenIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

export default function Courses({ courses = [] }: { courses?: Course[] }) {
    const [courseId, setCourseId] = useState("");
    const [lectureId, setLectureId] = useState<string | null>(null);
    const [showResources, setShowResources] = useState(false);
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState<LectureStatus | "all">("all");

    const heading = useRef<HTMLHeadingElement>(null);

    const course = courses.find((item) => item.id === courseId);
    const lecture = course?.lectures.find((item) => item.id === lectureId);

    useEffect(() => {
        heading.current?.focus();
    }, [courseId, lectureId]);

    function openCourse(id: string) {
        setCourseId(id);
        setLectureId(null);
        setShowResources(false);
        setQuery("");
        setStatus("all");
    }

    function changeCourse(id: string) {
        setCourseId(id);
        setLectureId(null);
        setQuery("");
        setStatus("all");
    }

    function backToCourses() {
        setCourseId("");
        setLectureId(null);
        setShowResources(false);
        setQuery("");
        setStatus("all");
    }

    if (!course) {
        return (
            <div className="courses-page">
                <header className="courses-heading">
                    <p className="courses-eyebrow">My Courses</p>

                    <h1 ref={heading} tabIndex={-1}>
                        Courses
                    </h1>

                    <p>View your enrolled courses and recent course activity.</p>
                </header>

                {courses.length > 0 ? (
                    <ul className="course-dashboard-grid" role="list">
                        {courses.map((item) => {
                            const readyLectures = item.lectures.filter((itemLecture) => itemLecture.status === "ready").length;

                            const resourceCount = item.lectures.reduce((total, itemLecture) => total + itemLecture.resources.length, 0);

                            return (
                                <li key={item.id}>
                                    <button type="button" className="course-dashboard-card" onClick={() => openCourse(item.id)}>
                                        <span className="course-dashboard-icon">
                                            <BookOpenIcon size={24} aria-hidden />
                                        </span>

                                        <span className="course-dashboard-code">{item.code}</span>

                                        <span className="course-dashboard-name">{item.name}</span>

                                        <span className="course-dashboard-description">{item.description}</span>

                                        <span className="course-dashboard-activity">
                                            <span>
                                                {item.lectures.length} {item.lectures.length === 1 ? "lecture" : "lectures"}
                                            </span>

                                            <span>{readyLectures} ready</span>

                                            <span>
                                                {resourceCount} {resourceCount === 1 ? "resource" : "resources"}
                                            </span>
                                        </span>

                                        <span className="course-dashboard-open">
                                            Open course
                                            <ArrowRightIcon size={18} aria-hidden />
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <div className="lecture-empty">
                        <BookOpenIcon size={32} aria-hidden />
                        <h2>No courses yet</h2>
                        <p>Your enrolled courses will appear here when they are available.</p>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="courses-page">
            <header className="courses-heading">
                <div className="courses-heading-top">
                    <div>
                        <button type="button" className="lecture-text-button" onClick={backToCourses}>
                            ← All Courses
                        </button>

                        <p className="courses-eyebrow">My Courses / {course.code}</p>

                        <h1 ref={heading} tabIndex={-1}>
                            {showResources ? "Course Resources" : lecture ? lecture.title : course.name}
                        </h1>

                        <p>
                            {showResources
                                ? "Upload and view PDF lecture notes, assignments, or study guides."
                                : lecture
                                  ? "Review your lecture and the content available so far."
                                  : course.description}
                        </p>
                    </div>

                    <button onClick={() => setShowResources((current) => !current)} className="resources-toggle-btn" type="button">
                        {showResources ? "Back to Course" : "Resources"}
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
