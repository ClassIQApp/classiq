import { ApiError } from "../../api/auth/client";
import { useAuth } from "../../api/auth/provider";
import type { CourseSettingsUpdate } from "../../api/courses/types";
import { useCourses, useCreateCourse, useUpdateCourse } from "../../api/courses/use-courses";
import CourseCard from "../../components/courses/course-card";
import CourseForm from "../../components/courses/course-form";
import { useTranslation } from "../../i18n/use-translation";
import "./TeacherCourses.css";
import { PlusIcon } from "@phosphor-icons/react";
import { Fragment, useState } from "react";
import type { FormEvent, ReactNode } from "react";

const emptyCourse: CourseSettingsUpdate = {
    code: "",
    name: "",
    description: "",
};

function createSlug(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replaceAll(/[^\p{L}\p{N}]+/gu, "-")
        .replaceAll(/^-+|-+$/g, "");
}

interface CoursesProps {
    onOpenCourse: (courseId: string) => void;
    pendingInvitations?: ReactNode;
    renderInviteForm?: (courseId: string) => ReactNode;
}

export default function Courses({ onOpenCourse, pendingInvitations, renderInviteForm }: CoursesProps) {
    const { t } = useTranslation();
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

    function describeCourseError(courseError: Error | null) {
        if (!courseError) {
            return null;
        }

        if (courseError instanceof ApiError && courseError.code === "COURSE_CONFLICT") {
            return t("courses.conflictError");
        }

        return courseError.message;
    }

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
            {
                ...course,
                slug: createSlug(`${course.code}-${course.name}`),
            },
            {
                onSuccess: () => setShowCreateForm(false),
            },
        );
    }

    function handleUpdate(update: CourseSettingsUpdate) {
        if (!editingCourse) {
            return;
        }

        updateCourse.mutate(
            {
                courseId: editingCourse.id,
                update,
            },
            {
                onSuccess: () => setEditingCourseId(null),
            },
        );
    }

    async function handleJoinSubmit(e: FormEvent) {
        e.preventDefault();

        setJoinError(null);
        setIsJoining(true);

        try {
            const response = await apiFetch("/courses/join", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    joinCode: joinCode.trim().toUpperCase(),
                }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));

                throw new Error(data.message || t("courses.joinFailed"));
            }

            setIsJoinModalOpen(false);
            setJoinCode("");

            await refetch();
        } catch (error_) {
            const message = error_ instanceof Error ? error_.message : "";

            setJoinError(message || t("courses.unexpectedError"));
        } finally {
            setIsJoining(false);
        }
    }

    if (isPending) {
        return <p role="status">{t("courses.loading")}</p>;
    }

    if (isError) {
        return (
            <div className="teacher-course-error" role="alert">
                <h2>{t("courses.loadError")}</h2>

                <p>{error.message}</p>

                <button className="teacher-course-primary-btn" type="button" onClick={() => void refetch()}>
                    {t("courses.retry")}
                </button>
            </div>
        );
    }

    return (
        <div className="teacher-courses-page">
            <header className="teacher-courses-header">
                <div>
                    <p className="teacher-courses-eyebrow">{t("courses.eyebrow")}</p>

                    <h1>{t("courses.title")}</h1>

                    <p className="teacher-courses-subtitle">{t("courses.description")}</p>
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
                            {t("courses.joinCourse")}
                        </button>

                        <button className="teacher-course-primary-btn" type="button" onClick={openCreateForm}>
                            <PlusIcon className="button-icon" weight="bold" aria-hidden />

                            {t("courses.createCourse")}
                        </button>
                    </div>
                )}
            </header>

            {pendingInvitations}

            {isJoinModalOpen && (
                <div className="teacher-join-dialog-backdrop">
                    <div className="teacher-join-dialog">
                        <h2>{t("courses.joinClass")}</h2>

                        <p>{t("courses.joinPrompt")}</p>

                        {joinError && <div className="teacher-course-form-error">{joinError}</div>}

                        <form className="teacher-course-form" onSubmit={handleJoinSubmit}>
                            <input
                                type="text"
                                placeholder={t("courses.joinCodePlaceholder")}
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
                                    {t("courses.cancel")}
                                </button>

                                <button type="submit" disabled={isJoining} className="teacher-course-primary-btn">
                                    {isJoining ? t("courses.joining") : t("courses.join")}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showCreateForm && (
                <CourseForm
                    eyebrow={t("courses.newCourse")}
                    title={t("courses.createCourse")}
                    description={t("courses.createDescription")}
                    initialValues={emptyCourse}
                    submitLabel={t("courses.createCourse")}
                    pendingLabel={t("courses.creating")}
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
                            eyebrow={t("courses.courseSettings")}
                            title={editingCourse.name}
                            description={t("courses.updateDescription")}
                            initialValues={editingCourse}
                            submitLabel={t("courses.saveChanges")}
                            pendingLabel={t("courses.saving")}
                            pending={updateCourse.isPending}
                            error={describeCourseError(updateCourse.error)}
                            onSubmit={handleUpdate}
                            onCancel={cancelForm}
                        />

                        <div className="teacher-join-code-section">
                            <h3 className="teacher-join-code-title">{t("courses.studentJoinCode")}</h3>

                            <p className="teacher-join-code-desc">{t("courses.studentJoinCodeDescription")}</p>

                            <div className="teacher-join-code-content">
                                <span className="teacher-join-code-value">{editingCourse.joinCode || t("courses.notAvailable")}</span>

                                <button
                                    type="button"
                                    className="teacher-course-secondary-btn teacher-join-code-copy-btn"
                                    onClick={() => {
                                        if (editingCourse.joinCode) {
                                            void navigator.clipboard.writeText(editingCourse.joinCode);
                                        }
                                    }}
                                >
                                    {t("courses.copyCode")}
                                </button>
                            </div>
                        </div>
                    </div>

                    {renderInviteForm?.(editingCourse.id)}
                </Fragment>
            )}

            <section className="teacher-course-list-section">
                <div className="teacher-course-list-heading">
                    <h2>{t("courses.yourCourses")}</h2>

                    <p>
                        {courses.length} {courses.length === 1 ? t("courses.courseSingular") : t("courses.coursePlural")}
                    </p>
                </div>

                {courses.length === 0 ? (
                    <div className="teacher-course-empty">
                        <h3>{t("courses.noCourses")}</h3>

                        <p>{t("courses.noCoursesDescription")}</p>

                        {!showCreateForm && (
                            <button className="teacher-course-primary-btn" type="button" onClick={openCreateForm}>
                                <PlusIcon className="button-icon" weight="bold" aria-hidden />

                                {t("courses.createCourse")}
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
