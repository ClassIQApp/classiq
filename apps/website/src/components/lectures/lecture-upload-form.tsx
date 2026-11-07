import { useAuth } from "../../api/auth/provider";
import type { ProcessingRunResult } from "../../api/lectures/processing";
import { RecordingSession } from "../../api/lectures/recording-session";
import { useRetryProcessing } from "../../api/lectures/use-lecture";
import { retryErrorMessage } from "./processing-notice";
import { PlusIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

interface LectureUploadFormProps {
    courseId: string;
    onOpenLecture?: (lectureId: string) => void;
}

interface SavedRecording {
    lectureId: string;
    processing?: ProcessingRunResult;
}

const supportedTypes = new Set(["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/webm", "video/mp4", "video/webm"]);

const maxFileSize = 500 * 1024 ** 2;

export default function LectureUploadForm({ courseId, onOpenLecture }: LectureUploadFormProps) {
    const { state } = useAuth();

    return (
        <RecordingForm
            key={`${state.status === "authenticated" ? state.user.id : state.status}:${courseId}`}
            courseId={courseId}
            onOpenLecture={onOpenLecture}
        />
    );
}

function formatMegabytes(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(1);
}

function RecordingForm({ courseId, onOpenLecture }: LectureUploadFormProps) {
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
    const [saved, setSaved] = useState<SavedRecording | null>(null);
    const [error, setError] = useState("");
    const retry = useRetryProcessing(courseId);

    function reset() {
        session.current = new RecordingSession();
        setTitle("");
        setDescription("");
        setFile(null);
        setProgress(0);
        setSaved(null);
        setError("");
        retry.reset();
    }

    function chooseFile(selected: File | null) {
        session.current = new RecordingSession();
        setError("");
        setSaved(null);
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
            setSaved(null);
            retry.reset();
            setProgress(0);

            const asset = await session.current.run(apiFetch, courseId, title, description, file, controller.signal, setProgress, () =>
                queryClient.invalidateQueries({ queryKey: ["courses"] }),
            );

            if (controller.signal.aborted) {
                return;
            }

            setSaved({ lectureId: session.current.lectureId!, processing: asset.processing });
            session.current = new RecordingSession();

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

    function retryStart() {
        if (!saved) {
            return;
        }

        retry.mutate(saved.lectureId, { onSuccess: (run) => setSaved({ ...saved, processing: run }) });
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
                <PlusIcon className="button-icon" weight="bold" aria-hidden />
                Upload Lecture
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
                        if (!uploading) {
                            setOpen(false);
                            reset();

                            return;
                        }

                        active.current?.abort();
                        void queryClient.invalidateQueries({ queryKey: ["courses"] });
                        setUploading(false);
                        setError("Upload paused. Retry to resume while this form stays open; closing it starts over.");
                    }}
                >
                    {uploading ? "Cancel upload" : "Close"}
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

                {uploading && file && (
                    <div className="lecture-upload-progress">
                        <progress value={progress} max={100} aria-label="Recording transfer progress" />
                        <span role="status">
                            {progress === 100
                                ? "Transferred. Verifying and saving the recording…"
                                : `${formatMegabytes((file.size * progress) / 100)} of ${formatMegabytes(file.size)} MB transferred`}
                        </span>
                    </div>
                )}

                {error && (
                    <p className="lecture-upload-error" role="alert">
                        {error}
                    </p>
                )}

                {saved && (
                    <SavedMessage
                        saved={saved}
                        retrying={retry.isPending}
                        retryError={retry.error}
                        onRetry={retryStart}
                        onOpenLecture={onOpenLecture}
                    />
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

interface SavedMessageProps {
    saved: SavedRecording;
    retrying: boolean;
    retryError: Error | null;
    onRetry: () => void;
    onOpenLecture?: (lectureId: string) => void;
}

export function SavedMessage({ saved, retrying, retryError, onRetry, onOpenLecture }: SavedMessageProps) {
    const startFailed = saved.processing?.status === "failed";
    let message = "Recording saved.";

    if (saved.processing && !startFailed) {
        message = "Recording saved. Processing has started, and the lecture updates as study materials are ready.";
    }

    if (startFailed) {
        const reason = saved.processing?.error_code === "START_FAILED" ? "" : (saved.processing?.status_message ?? "");

        message = [
            "Recording saved, but processing didn't start.",
            reason,
            "The recording is safe, so retry processing without uploading again.",
        ]
            .filter(Boolean)
            .join(" ");
    }

    return (
        <div className={startFailed ? "lecture-upload-warning" : "lecture-upload-success"} role="status">
            <p>{message}</p>
            {retryError && <p role="alert">{retryErrorMessage(retryError)}</p>}
            <div className="lecture-upload-result-actions">
                {startFailed && (
                    <button type="button" className="lecture-text-button" disabled={retrying} onClick={onRetry}>
                        {retrying ? "Starting…" : "Retry processing"}
                    </button>
                )}
                {onOpenLecture && (
                    <button type="button" className="lecture-text-button" onClick={() => onOpenLecture(saved.lectureId)}>
                        Open lecture
                    </button>
                )}
            </div>
        </div>
    );
}
