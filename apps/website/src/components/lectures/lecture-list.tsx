import type { Course } from "../../api/courses/types";
import type { LectureStatus as Status } from "../../api/lectures/types";
import LectureStatus, { availabilitySummary, statusLabelByStatus } from "./lecture-status";
import LectureUploadForm from "./lecture-upload-form";
import { ArrowRightIcon, BookOpenIcon } from "@phosphor-icons/react";

export type LectureSort = "newest" | "oldest" | "title";

const statuses: Status[] = ["ready", "processing", "uploaded", "failed", "pending"];

interface LectureListProps {
    courses: Course[];
    course?: Course;
    query: string;
    status: Status | "all";
    sort: LectureSort;
    onCourseChange: (id: string) => void;
    onQueryChange: (value: string) => void;
    onStatusChange: (value: Status | "all") => void;
    onSortChange: (value: LectureSort) => void;
    onOpenLecture: (id: string) => void;
}

export default function LectureList({
    courses,
    course,
    query,
    status,
    sort,
    onCourseChange,
    onQueryChange,
    onStatusChange,
    onSortChange,
    onOpenLecture,
}: LectureListProps) {
    const normalizedQuery = query.trim().toLowerCase();
    const courseLectures = course?.lectures ?? [];

    const lectures = courseLectures.filter(
        (lecture) =>
            (status === "all" || lecture.status === status) &&
            `${lecture.title} ${lecture.description}`.toLowerCase().includes(normalizedQuery),
    );

    lectures.sort((first, second) => {
        if (sort === "title") {
            return first.title.localeCompare(second.title, "en", { numeric: true, sensitivity: "base" });
        }

        // Lecture IDs increase as records are added; the API does not expose creation dates.
        return sort === "newest" ? Number(second.id) - Number(first.id) : Number(first.id) - Number(second.id);
    });

    let emptyState = {
        title: "No courses yet",
        description: "Your courses and lectures will appear here when available.",
    };

    if (course) {
        emptyState = {
            title: "No lectures yet",
            description:
                course.role === "teacher"
                    ? "Upload your first lecture recording to get started."
                    : "Lectures will appear here when your instructor adds them.",
        };

        if (courseLectures.length > 0) {
            emptyState = {
                title: "No matching lectures",
                description: "Try a different search or processing state.",
            };
        }
    }

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
                            const value = statuses.find((item) => item === event.target.value) ?? "all";

                            onStatusChange(value);
                        }}
                    >
                        <option value="all">All states</option>
                        {statuses.map((item) => (
                            <option key={item} value={item}>
                                {statusLabelByStatus[item]}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Sort by
                    <select
                        value={sort}
                        onChange={(event) => {
                            const value = event.target.value;

                            if (value === "newest" || value === "oldest" || value === "title") {
                                onSortChange(value);
                            }
                        }}
                    >
                        <option value="newest">Newest added</option>
                        <option value="oldest">Oldest added</option>
                        <option value="title">Title A–Z</option>
                    </select>
                </label>
            </div>

            <div className="lecture-list-heading">
                <div>
                    <h2 id="lecture-list-heading">Lectures</h2>

                    <p role="status">
                        {lectures.length} of {courseLectures.length} lectures
                    </p>
                </div>
            </div>

            {course?.role === "teacher" && <LectureUploadForm key={course.id} courseId={course.id} onOpenLecture={onOpenLecture} />}

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
                                    <span>{availabilitySummary(lecture)}</span>

                                    <span className="lecture-open">
                                        View lecture
                                        <ArrowRightIcon size={18} aria-hidden />
                                    </span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="lecture-empty">
                    <BookOpenIcon size={32} aria-hidden />

                    <h3>{emptyState.title}</h3>

                    <p>{emptyState.description}</p>

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
