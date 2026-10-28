import type { CourseSettingsUpdate } from "../../api/courses/types";
import { useState } from "react";
import type { FormEvent } from "react";

interface CourseFormProps {
    eyebrow: string;
    title: string;
    description: string;
    initialValues: CourseSettingsUpdate;
    submitLabel: string;
    pendingLabel: string;
    pending: boolean;
    error: string | null;
    onSubmit: (values: CourseSettingsUpdate) => void;
    onCancel: () => void;
}

export default function CourseForm({
    eyebrow,
    title,
    description,
    initialValues,
    submitLabel,
    pendingLabel,
    pending,
    error,
    onSubmit,
    onCancel,
}: CourseFormProps) {
    const [code, setCode] = useState(initialValues.code);
    const [name, setName] = useState(initialValues.name);
    const [courseDescription, setCourseDescription] = useState(initialValues.description);

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (pending) {
            return;
        }

        onSubmit({ code: code.trim(), name: name.trim(), description: courseDescription.trim() });
    }

    return (
        <section className="teacher-course-form-card" aria-label={title}>
            <div className="teacher-course-form-heading">
                <div>
                    <p className="teacher-courses-eyebrow">{eyebrow}</p>
                    <h2>{title}</h2>
                    <p>{description}</p>
                </div>
            </div>

            <form className="teacher-course-form" onSubmit={handleSubmit} aria-busy={pending}>
                <div className="teacher-course-form-grid">
                    <label>
                        Course Code
                        <input
                            type="text"
                            name="code"
                            value={code}
                            onChange={(event) => setCode(event.target.value)}
                            placeholder="CSI 4500"
                            required
                            pattern=".*\S.*"
                            disabled={pending}
                        />
                    </label>

                    <label>
                        Course Name
                        <input
                            type="text"
                            name="name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Operating Systems"
                            required
                            pattern=".*\S.*"
                            disabled={pending}
                        />
                    </label>
                </div>

                <label>
                    Description
                    <textarea
                        name="description"
                        value={courseDescription}
                        onChange={(event) => setCourseDescription(event.target.value)}
                        placeholder="Enter a short course description"
                        rows={4}
                        disabled={pending}
                    />
                </label>

                {error && (
                    <p className="teacher-course-form-error" role="alert">
                        {error}
                    </p>
                )}

                <div className="teacher-course-form-actions">
                    <button className="teacher-course-primary-btn" type="submit" disabled={pending}>
                        {pending ? pendingLabel : submitLabel}
                    </button>

                    <button className="teacher-course-secondary-btn" type="button" onClick={onCancel} disabled={pending}>
                        Cancel
                    </button>
                </div>
            </form>
        </section>
    );
}
