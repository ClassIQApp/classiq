import type { Course } from "../../api/courses/types";
import { useCourses } from "../../api/courses/use-courses";
import "./TeacherCourses.css";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useState } from "react";

interface CourseInput {
    code: string;
    name: string;
    slug: string;
    description: string;
}

function createSlug(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-")
        .replaceAll(/^-+|-+$/g, "");
}

export default function Courses() {
    const { data: courses = [], isPending, isError, refetch } = useCourses(true);

    const queryClient = useQueryClient();

    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingCourse, setEditingCourse] = useState<Course | null>(null);

    const [code, setCode] = useState("");
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");

    const createCourse = useMutation({
        mutationFn: async (course: CourseInput) => {
            const apiUrl = import.meta.env.VITE_API_URL;

            const response = await fetch(`${apiUrl}/courses`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(course),
            });

            if (!response.ok) {
                throw new Error("Course creation failed");
            }

            return response.json();
        },

        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ["courses"],
            });

            clearForm();
            setShowCreateForm(false);
        },
    });

    const updateCourse = useMutation({
        mutationFn: async ({ courseId, course }: { courseId: string; course: CourseInput }) => {
            const apiUrl = import.meta.env.VITE_API_URL;

            const response = await fetch(`${apiUrl}/courses/${courseId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(course),
            });

            if (!response.ok) {
                throw new Error("Course update failed");
            }

            return response.json();
        },

        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ["courses"],
            });

            clearForm();
            setEditingCourse(null);
        },
    });

    function clearForm() {
        setCode("");
        setName("");
        setDescription("");
    }

    function openCreateForm() {
        clearForm();
        setEditingCourse(null);
        setShowCreateForm(true);
    }

    function openEditForm(course: Course) {
        setShowCreateForm(false);
        setEditingCourse(course);

        setCode(course.code);
        setName(course.name);
        setDescription(course.description);
    }

    function cancelForm() {
        clearForm();
        setShowCreateForm(false);
        setEditingCourse(null);
    }

    function handleCreate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        createCourse.mutate({
            code,
            name,
            slug: createSlug(`${code}-${name}`),
            description,
        });
    }

    function handleUpdate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!editingCourse) {
            return;
        }

        updateCourse.mutate({
            courseId: editingCourse.id,
            course: {
                code,
                name,
                slug: createSlug(`${code}-${name}`),
                description,
            },
        });
    }

    if (isPending) {
        return <p role="status">Loading courses…</p>;
    }

    if (isError) {
        return (
            <div className="teacher-course-error" role="alert">
                <h2>Courses could not load</h2>
                <p>There was a problem loading your courses.</p>

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
                    <p className="teacher-courses-eyebrow">Course Management</p>
                    <h1>Courses</h1>
                    <p className="teacher-courses-subtitle">Create courses and manage course information.</p>
                </div>

                {!showCreateForm && !editingCourse && (
                    <button className="teacher-course-primary-btn" type="button" onClick={openCreateForm}>
                        + Create Course
                    </button>
                )}
            </header>

            {showCreateForm && (
                <section className="teacher-course-form-card">
                    <div className="teacher-course-form-heading">
                        <div>
                            <p className="teacher-courses-eyebrow">New Course</p>
                            <h2>Create Course</h2>
                            <p>Enter the information students will see for this course.</p>
                        </div>
                    </div>

                    <form className="teacher-course-form" onSubmit={handleCreate}>
                        <div className="teacher-course-form-grid">
                            <label>
                                Course Code
                                <input
                                    type="text"
                                    value={code}
                                    onChange={(event) => setCode(event.target.value)}
                                    placeholder="CSI 4500"
                                    required
                                />
                            </label>

                            <label>
                                Course Name
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    placeholder="Operating Systems"
                                    required
                                />
                            </label>
                        </div>

                        <label>
                            Description
                            <textarea
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                placeholder="Enter a short course description"
                                rows={4}
                            />
                        </label>

                        {createCourse.isError && (
                            <p className="teacher-course-form-error" role="alert">
                                Course could not be created. Please try again.
                            </p>
                        )}

                        <div className="teacher-course-form-actions">
                            <button className="teacher-course-primary-btn" type="submit" disabled={createCourse.isPending}>
                                {createCourse.isPending ? "Creating..." : "Create Course"}
                            </button>

                            <button className="teacher-course-secondary-btn" type="button" onClick={cancelForm}>
                                Cancel
                            </button>
                        </div>
                    </form>
                </section>
            )}

            {editingCourse && (
                <section className="teacher-course-form-card">
                    <div className="teacher-course-form-heading">
                        <div>
                            <p className="teacher-courses-eyebrow">Course Settings</p>
                            <h2>{editingCourse.name}</h2>
                            <p>Update the course information students will see.</p>
                        </div>
                    </div>

                    <form className="teacher-course-form" onSubmit={handleUpdate}>
                        <div className="teacher-course-form-grid">
                            <label>
                                Course Code
                                <input type="text" value={code} onChange={(event) => setCode(event.target.value)} required />
                            </label>

                            <label>
                                Course Name
                                <input type="text" value={name} onChange={(event) => setName(event.target.value)} required />
                            </label>
                        </div>

                        <label>
                            Description
                            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
                        </label>

                        {updateCourse.isError && (
                            <p className="teacher-course-form-error" role="alert">
                                Course could not be updated. Please try again.
                            </p>
                        )}

                        <div className="teacher-course-form-actions">
                            <button className="teacher-course-primary-btn" type="submit" disabled={updateCourse.isPending}>
                                {updateCourse.isPending ? "Saving..." : "Save Changes"}
                            </button>

                            <button className="teacher-course-secondary-btn" type="button" onClick={cancelForm}>
                                Cancel
                            </button>
                        </div>
                    </form>
                </section>
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
                        <p>Create your first course to get started.</p>

                        {!showCreateForm && (
                            <button className="teacher-course-primary-btn" type="button" onClick={openCreateForm}>
                                + Create Course
                            </button>
                        )}
                    </div>
                ) : (
                    <ul className="teacher-course-grid" role="list">
                        {courses.map((course) => (
                            <li className="teacher-course-card" key={course.id}>
                                <div>
                                    <span className="teacher-course-code">{course.code}</span>

                                    <h3>{course.name}</h3>

                                    <p className="teacher-course-description">{course.description || "No description added."}</p>
                                </div>

                                <div className="teacher-course-card-footer">
                                    <span>
                                        {course.lectures.length} {course.lectures.length === 1 ? "lecture" : "lectures"}
                                    </span>

                                    <button className="teacher-course-settings-btn" type="button" onClick={() => openEditForm(course)}>
                                        Course Settings
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
