import { useAuth } from "../../api/auth/provider";
import { RecordingSession } from "../../api/lectures/recording-session";
import { useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

interface LectureUploadFormProps {
    courseId: string;
}

const supportedTypes = new Set(["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/webm", "video/mp4", "video/webm"]);

const maxFileSize = 500 * 1024 ** 2;

export default function LectureUploadForm({ courseId }: LectureUploadFormProps) {
    const { state } = useAuth();

    return <RecordingForm key={`${state.status === "authenticated" ? state.user.id : state.status}:${courseId}`} courseId={courseId} />;
}

function RecordingForm({ courseId }: LectureUploadFormProps) {
    const { apiFetch } = useAuth();
    const session = useRef(new RecordingSession());
    const active = useRef<AbortController | null>(null);

    useEffect(
        () => () => {
            active.current?.abort();
        },
        [apiFetch, courseId],
    );
    const queryClient = useQueryClient();

    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [progress, setProgress] = useState(0);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    function reset() {
        session.current = new RecordingSession();
        setTitle("");
        setDescription("");
        setFile(null);
        setProgress(0);
        setMessage("");
        setError("");
    }

    function chooseFile(selected: File | null) {
        setError("");
        setMessage("");
        setProgress(0);

        if (!selected) {
            setFile(null);

            return;
        }

        if (!supportedTypes.has(selected.type)) {
            setFile(null);
            setError("Choose a supported audio or video recording.");

            return;
        }

        if (selected.size === 0 || selected.size > maxFileSize) {
            setFile(null);
            setError("Choose a nonempty recording of 500 MB or smaller.");

            return;
        }

        setFile(selected);
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!file) {
            setError("Choose a recording file.");

            return;
        }

        const controller = new AbortController();
        active.current = controller;

        try {
            setUploading(true);
            setError("");
            setMessage("");
            setProgress(0);

            await session.current.run(apiFetch, courseId, title, description, file, controller.signal, setProgress, () =>
                queryClient.invalidateQueries({ queryKey: ["courses"] }),
            );

            if (controller.signal.aborted) {
                return;
            }

            session.current = new RecordingSession();
            setMessage("Lecture recording uploaded successfully.");

            setTitle("");
            setDescription("");
            setFile(null);
            setProgress(100);
        } catch (uploadError) {
            if (controller.signal.aborted) {
                return;
            }

            setError(uploadError instanceof Error ? uploadError.message : "Lecture recording could not be uploaded.");
        } finally {
            if (!controller.signal.aborted) {
                setUploading(false);
            }
        }
    }

    if (!open) {
        return (
            <button
                type="button"
                className="lecture-upload-open"
                onClick={() => {
                    reset();
                    setOpen(true);
                }}
            >
                + Upload Lecture
            </button>
        );
    }

    let submitLabel = "Upload Lecture";

    if (session.current.lectureId) {
        submitLabel = "Retry recording";
    }

    if (uploading) {
        submitLabel = "Uploading…";
    }

    return (
        <div className="lecture-upload-panel">
            <div className="lecture-upload-heading">
                <div>
                    <h3>Upload Lecture</h3>
                    <p>Add the lecture information and select its recording.</p>
                </div>

                <button
                    type="button"
                    className="lecture-text-button"
                    onClick={() => {
                        active.current?.abort();
                        void queryClient.invalidateQueries({ queryKey: ["courses"] });
                        setUploading(false);
                        setError("Upload paused. Retry to resume this lecture.");
                    }}
                >
                    Cancel
                </button>
            </div>

            <form className="lecture-upload-form" onSubmit={handleSubmit}>
                <label>
                    Lecture Title
                    <input
                        type="text"
                        value={title}
                        placeholder="Introduction to Operating Systems"
                        disabled={uploading || !!session.current.lectureId}
                        required
                        onChange={(event) => setTitle(event.target.value)}
                    />
                </label>

                <label>
                    Description
                    <textarea
                        value={description}
                        placeholder="Enter a short lecture description"
                        rows={3}
                        disabled={uploading || !!session.current.lectureId}
                        required
                        onChange={(event) => setDescription(event.target.value)}
                    />
                </label>

                <label>
                    Recording
                    <input
                        type="file"
                        accept="audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/webm,video/mp4,video/webm"
                        disabled={uploading || !!session.current.lectureId}
                        onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                    />
                </label>

                {file && (
                    <p className="lecture-upload-file">
                        {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                )}

                {uploading && (
                    <div className="lecture-upload-progress">
                        <progress value={progress} max={100} />
                        <span>{progress}% uploaded</span>
                    </div>
                )}

                {error && (
                    <p className="lecture-upload-error" role="alert">
                        {error}
                    </p>
                )}

                {message && (
                    <p className="lecture-upload-success" role="status">
                        {message}
                    </p>
                )}

                <button
                    className="resources-toggle-btn"
                    type="submit"
                    disabled={uploading || !title.trim() || !description.trim() || !file}
                >
                    {submitLabel}
                </button>
            </form>
        </div>
    );
}
