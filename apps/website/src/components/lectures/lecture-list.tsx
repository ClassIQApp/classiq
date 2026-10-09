import type { Course, LectureStatus as Status } from "../../types/lecture";
import LectureStatus from "./lecture-status";
import { ArrowRightIcon, BookOpenIcon } from "@phosphor-icons/react";

interface LectureListProps {
    courses: Course[];
    course?: Course;
    query: string;
    status: Status | "all";
    onCourseChange: (id: string) => void;
    onQueryChange: (value: string) => void;
    onStatusChange: (value: Status | "all") => void;
    onOpenLecture: (id: string) => void;
}

export default function LectureList({
    courses,
    course,
    query,
    status,
    onCourseChange,
    onQueryChange,
    onStatusChange,
    onOpenLecture,
}: LectureListProps) {
    const normalizedQuery = query.trim().toLowerCase();
    const courseLectures = course?.lectures ?? [];
    const lectures = courseLectures.filter(
        (lecture) =>
            (status === "all" || lecture.status === status) &&
            `${lecture.title} ${lecture.description}`.toLowerCase().includes(normalizedQuery),
    );

    return (
        <section aria-labelledby="lecture-list-heading">
            <div className="lecture-filters">
                <label>
                    Course
                    <select
                        value={course?.id ?? ""}
                        disabled={courses.length === 0}
                        onChange={(event) => onCourseChange(event.target.value)}
                    >
                        {courses.length === 0 && <option value="">No courses available</option>}
                        {courses.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.code} · {item.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Find a lecture
                    <input
                        type="search"
                        value={query}
                        placeholder="Search lectures…"
                        onChange={(event) => onQueryChange(event.target.value)}
                    />
                </label>
                <label>
                    Processing state
                    <select
                        value={status}
                        onChange={(event) => {
                            const value = event.target.value;
                            if (value === "all" || value === "ready" || value === "processing" || value === "failed") {
                                onStatusChange(value);
                            }
                        }}
                    >
                        <option value="all">All states</option>
                        <option value="ready">Ready</option>
                        <option value="processing">Processing</option>
                        <option value="failed">Failed</option>
                    </select>
                </label>
            </div>
            <div className="lecture-list-heading">
                <h2 id="lecture-list-heading">Lectures</h2>
                <p role="status">
                    {lectures.length} of {courseLectures.length} lectures
                </p>
            </div>
            {lectures.length > 0 ? (
                <ul className="lecture-list" role="list">
                    {lectures.map((lecture) => (
                        <li key={lecture.id}>
                            <button type="button" className="lecture-card" onClick={() => onOpenLecture(lecture.id)}>
                                <span className="lecture-card-top">
                                    <LectureStatus status={lecture.status} />
                                </span>
                                <span className="lecture-card-title">{lecture.title}</span>
                                <span className="lecture-card-description">{lecture.description}</span>
                                <span className="lecture-card-bottom">
                                    <span>
                                        {lecture.transcript ? "Transcript available" : "Transcript unavailable"} ·{" "}
                                        {lecture.resources.length} {lecture.resources.length === 1 ? "resource" : "resources"}
                                    </span>
                                    <span className="lecture-open">
                                        View lecture <ArrowRightIcon size={18} aria-hidden />
                                    </span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="lecture-empty">
                    <BookOpenIcon size={32} aria-hidden />
                    <h3>{course ? (courseLectures.length === 0 ? "No lectures yet" : "No matching lectures") : "No courses yet"}</h3>
                    <p>
                        {course
                            ? courseLectures.length === 0
                                ? "Lectures will appear here when your instructor adds them."
                                : "Try a different search or processing state."
                            : "Your courses and lectures will appear here when available."}
                    </p>
                    {courseLectures.length > 0 && (
                        <button
                            type="button"
                            className="lecture-text-button"
                            onClick={() => {
                                onQueryChange("");
                                onStatusChange("all");
                            }}
                        >
                            Clear filters
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}
