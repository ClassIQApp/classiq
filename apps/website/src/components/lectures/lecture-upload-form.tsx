import { useAuth } from "../../api/auth/provider";
import { completeRecordingUpload, createRecordingUpload, uploadRecordingFile } from "../../api/lectures/recording-upload";
import "./lecture-upload-form.css";
import { useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useState } from "react";

interface LectureUploadFormProps {
    courseId: string;
}

const supportedTypes = new Set(["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/webm", "video/mp4", "video/webm"]);

const maxFileSize = 500 * 1024 ** 2;

export default function LectureUploadForm({ courseId }: LectureUploadFormProps) {
    const { apiFetch } = useAuth();
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

        if (selected.size > maxFileSize) {
            setFile(null);
            setError("Recording must be 500 MB or smaller.");
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

        try {
            setUploading(true);
            setError("");
            setMessage("");
            setProgress(0);

            const lectureResponse = await apiFetch(`/courses/${courseId}/lectures`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    title,
                    description,
                }),
            });

            const lecture: { id: string } = await lectureResponse.json();

            const ticket = await createRecordingUpload(apiFetch, courseId, lecture.id, file);

            await uploadRecordingFile(ticket, file, setProgress);

            await completeRecordingUpload(apiFetch, courseId, lecture.id, ticket.uploadId);

            await queryClient.invalidateQueries({
                queryKey: ["courses"],
            });

            setMessage("Lecture recording uploaded successfully.");

            setTitle("");
            setDescription("");
            setFile(null);
            setProgress(100);
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : "Lecture recording could not be uploaded.");
        } finally {
            setUploading(false);
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
                    disabled={uploading}
                    onClick={() => {
                        reset();
                        setOpen(false);
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
                        disabled={uploading}
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
                        disabled={uploading}
                        required
                        onChange={(event) => setDescription(event.target.value)}
                    />
                </label>

                <label>
                    Recording
                    <input
                        type="file"
                        accept="audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/webm,video/mp4,video/webm"
                        disabled={uploading}
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
                    {uploading ? "Uploading..." : "Upload Lecture"}
                </button>
            </form>
        </div>
    );
}
