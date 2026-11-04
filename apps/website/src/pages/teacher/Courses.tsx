import { ApiError } from "../../api/auth/client";
import { useAuth } from "../../api/auth/provider";
import type { CourseSettingsUpdate } from "../../api/courses/types";
import { useCourses, useCreateCourse, useUpdateCourse } from "../../api/courses/use-courses";
import CourseCard from "../../components/courses/course-card";
import CourseForm from "../../components/courses/course-form";
import "./TeacherCourses.css";
import { PlusIcon } from "@phosphor-icons/react";
import { Fragment, useState } from "react";
import type { ReactNode } from "react";

const emptyCourse: CourseSettingsUpdate = { code: "", name: "", description: "" };

function createSlug(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replaceAll(/[^\p{L}\p{N}]+/gu, "-")
        .replaceAll(/^-+|-+$/g, "");
}

function describeCourseError(error: Error | null) {
    if (!error) {
        return null;
    }

    if (error instanceof ApiError && error.code === "COURSE_CONFLICT") {
        return "A course with this code and name already exists. Change the code or name and try again.";
    }

    return error.message;
}

interface CoursesProps {
    onOpenCourse: (courseId: string) => void;
    pendingInvitations?: ReactNode;
    renderInviteForm?: (courseId: string) => ReactNode;
}

export default function Courses({ onOpenCourse, pendingInvitations, renderInviteForm }: CoursesProps) {
    const { apiFetch } = useAuth();
    const { data: courses = [], isPending, isError, error, refetch } = useCourses();
    const createCourse = useCreateCourse();
    const updateCourse = useUpdateCourse();

    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingCourseId, setEditingCourseId] = useState<string | null>(null);

    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
    const [joinCode, setJoinCode] = useState("");
    const [isJoining, setIsJoining] = useState(false);
    const [joinError, setJoinError] = useState<string | null>(null);

    const editingCourse = courses.find((course) => course.id === editingCourseId && course.role === "teacher");

    function openCreateForm() {
        createCourse.reset();
        setEditingCourseId(null);
        setShowCreateForm(true);
    }

    function openEditForm(courseId: string) {
        updateCourse.reset();
        setShowCreateForm(false);
        setEditingCourseId(courseId);
    }

    function cancelForm() {
        setShowCreateForm(false);
        setEditingCourseId(null);
    }

    function handleCreate(course: CourseSettingsUpdate) {
        createCourse.mutate(
            { ...course, slug: createSlug(`${course.code}-${course.name}`) },
            { onSuccess: () => setShowCreateForm(false) },
        );
    }

    function handleUpdate(update: CourseSettingsUpdate) {
        if (!editingCourse) {
            return;
        }

        updateCourse.mutate({ courseId: editingCourse.id, update }, { onSuccess: () => setEditingCourseId(null) });
    }

    async function handleJoinSubmit(e: React.FormEvent) {
        e.preventDefault();
        setJoinError(null);
        setIsJoining(true);

        try {
            const response = await apiFetch("/courses/join", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ joinCode: joinCode.trim().toUpperCase() }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.message || "Invalid join code or failed to join course.");
            }

            setIsJoinModalOpen(false);
            setJoinCode("");
            await refetch();
        } catch (error_) {
            const message = error_ instanceof Error ? error_.message : "";
            setJoinError(message || "An unexpected error occurred.");
        } finally {
            setIsJoining(false);
        }
    }

    if (isPending) {
        return <p role="status">Loading courses…</p>;
    }

    if (isError) {
        return (
            <div className="teacher-course-error" role="alert">
                <h2>Courses could not load</h2>
                <p>{error.message}</p>

                <button className="teacher-course-primary-btn" type="button" onClick={() => void refetch()}>
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="teacher-courses-page">
            <header className="teacher-courses-header">
                <div>
                    <p className="teacher-courses-eyebrow">My Courses</p>
                    <h1>Courses</h1>
                    <p className="teacher-courses-subtitle">Open the courses you teach or have joined, or create a new course.</p>
                </div>

                {!showCreateForm && !editingCourse && (
                    <div className="teacher-courses-actions">
                        <button
                            className="teacher-course-secondary-btn"
                            type="button"
                            onClick={() => {
                                setJoinError(null);
                                setJoinCode("");
                                setIsJoinModalOpen(true);
                            }}
                        >
                            Join Course
                        </button>
                        <button className="teacher-course-primary-btn" type="button" onClick={openCreateForm}>
                            <PlusIcon className="button-icon" weight="bold" aria-hidden />
                            Create Course
                        </button>
                    </div>
                )}
            </header>

            {pendingInvitations}

            {isJoinModalOpen && (
                <div className="teacher-join-dialog-backdrop">
                    <div className="teacher-join-dialog">
                        <h2>Join a Class</h2>
                        <p>Enter the course join code provided by your teacher.</p>

                        {joinError && <div className="teacher-course-form-error">{joinError}</div>}

                        <form className="teacher-course-form" onSubmit={handleJoinSubmit}>
                            <input
                                type="text"
                                placeholder="Enter join code..."
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value)}
                                className="teacher-join-code-input"
                                maxLength={6}
                                required
                            />

                            <div className="teacher-course-form-actions teacher-join-dialog-actions">
                                <button
                                    type="button"
                                    onClick={() => setIsJoinModalOpen(false)}
                                    className="teacher-course-secondary-btn"
                                    disabled={isJoining}
                                >
                                    Cancel
                                </button>
                                <button type="submit" disabled={isJoining} className="teacher-course-primary-btn">
                                    {isJoining ? "Joining..." : "Join"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showCreateForm && (
                <CourseForm
                    eyebrow="New Course"
                    title="Create Course"
                    description="Enter the information Members will see. You will be this course's Teacher."
                    initialValues={emptyCourse}
                    submitLabel="Create Course"
                    pendingLabel="Creating…"
                    pending={createCourse.isPending}
                    error={describeCourseError(createCourse.error)}
                    onSubmit={handleCreate}
                    onCancel={cancelForm}
                />
            )}

            {editingCourse && (
                <Fragment key={editingCourse.id}>
                    <div className="teacher-course-form-card">
                        <CourseForm
                            eyebrow="Course Settings"
                            title={editingCourse.name}
                            description="Update the course information Members will see."
                            initialValues={editingCourse}
                            submitLabel="Save Changes"
                            pendingLabel="Saving…"
                            pending={updateCourse.isPending}
                            error={describeCourseError(updateCourse.error)}
                            onSubmit={handleUpdate}
                            onCancel={cancelForm}
                        />

                        <div className="teacher-join-code-section">
                            <h3 className="teacher-join-code-title">Student Join Code</h3>
                            <p className="teacher-join-code-desc">Share this code with students so they can join this course.</p>
                            <div className="teacher-join-code-content">
                                <span className="teacher-join-code-value">{editingCourse.joinCode || "N/A"}</span>
                                <button
                                    type="button"
                                    className="teacher-course-secondary-btn teacher-join-code-copy-btn"
                                    onClick={() => {
                                        if (editingCourse.joinCode) {
                                            navigator.clipboard.writeText(editingCourse.joinCode);
                                        }
                                    }}
                                >
                                    Copy Code
                                </button>
                            </div>
                        </div>
                    </div>

                    {renderInviteForm?.(editingCourse.id)}
                </Fragment>
            )}

            <section className="teacher-course-list-section">
                <div className="teacher-course-list-heading">
                    <h2>Your Courses</h2>
                    <p>
                        {courses.length} {courses.length === 1 ? "course" : "courses"}
                    </p>
                </div>

                {courses.length === 0 ? (
                    <div className="teacher-course-empty">
                        <h3>No courses yet</h3>
                        <p>Create a course to teach it, or accept an invitation to join one.</p>

                        {!showCreateForm && (
                            <button className="teacher-course-primary-btn" type="button" onClick={openCreateForm}>
                                <PlusIcon className="button-icon" weight="bold" aria-hidden />
                                Create Course
                            </button>
                        )}
                    </div>
                ) : (
                    <ul className="teacher-course-grid" role="list">
                        {courses.map((course) => (
                            <CourseCard
                                key={course.id}
                                course={course}
                                onOpen={() => onOpenCourse(course.id)}
                                onEditSettings={() => openEditForm(course.id)}
                            />
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
