import { useAuth } from "../../api/auth/provider";
import type { Lecture } from "../../api/lectures/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

interface LectureEditFormProps {
    courseId: string;
    lecture: Lecture;
}

export default function LectureEditForm({ courseId, lecture }: LectureEditFormProps) {
    const { apiFetch, state } = useAuth();
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(lecture.title);
    const [description, setDescription] = useState(lecture.description);
    const update = useMutation({
        mutationFn: async (values: Pick<Lecture, "title" | "description">) => {
            await apiFetch(`/courses/${courseId}/lectures/${lecture.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });
        },
        onSuccess: async () => {
            if (state.status === "authenticated") {
                await queryClient.invalidateQueries({ queryKey: ["courses", state.user.id] });
            }

            setEditing(false);
        },
    });

    if (!editing) {
        return (
            <div>
                <button
                    type="button"
                    className="lecture-text-button"
                    onClick={() => {
                        setTitle(lecture.title);
                        setDescription(lecture.description);
                        update.reset();
                        setEditing(true);
                    }}
                >
                    Edit lecture
                </button>
                {update.isSuccess && <p role="status">Lecture updated.</p>}
            </div>
        );
    }

    return (
        <form
            className="teacher-course-form"
            aria-label="Edit lecture"
            onSubmit={(event) => {
                event.preventDefault();

                if (title.trim() && !update.isPending) {
                    update.mutate({ title: title.trim(), description: description.trim() });
                }
            }}
        >
            <label>
                Lecture title
                <input
                    name="title"
                    value={title}
                    required
                    pattern=".*\S.*"
                    disabled={update.isPending}
                    onChange={(event) => setTitle(event.target.value)}
                />
            </label>
            <label>
                Description
                <textarea
                    name="description"
                    value={description}
                    rows={4}
                    disabled={update.isPending}
                    onChange={(event) => setDescription(event.target.value)}
                />
            </label>
            {update.isError && (
                <p className="teacher-course-form-error" role="alert">
                    {update.error.message}
                </p>
            )}
            <div className="teacher-course-form-actions">
                <button className="teacher-course-primary-btn" type="submit" disabled={update.isPending || !title.trim()}>
                    {update.isPending ? "Saving..." : "Save changes"}
                </button>
                <button
                    className="teacher-course-secondary-btn"
                    type="button"
                    disabled={update.isPending}
                    onClick={() => setEditing(false)}
                >
                    Cancel
                </button>
            </div>
        </form>
    );
}
