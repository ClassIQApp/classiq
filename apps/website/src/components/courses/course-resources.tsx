import { useAuth } from "../../api/auth/provider";
import type { Lecture } from "../../api/lectures/types";
import { createResourcesApi, resourceQueryKey } from "../../api/resources/client";
import type { ResourceOperation } from "../../api/resources/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

interface CourseResourcesProps {
    courseId: string;
    lectures: Lecture[];
    canManage: boolean;
}

export default function CourseResources(props: CourseResourcesProps) {
    const { state, apiFetch } = useAuth();
    const api = useMemo(() => createResourcesApi(apiFetch), [apiFetch]);

    if (state.status !== "authenticated") {
        return null;
    }

    return <ResourceLibrary key={`${state.user.id}:${props.courseId}:${props.canManage}`} {...props} accountId={state.user.id} api={api} />;
}

export function ResourceLibrary({
    courseId,
    lectures,
    canManage,
    accountId,
    api,
}: CourseResourcesProps & { accountId: string; api: ReturnType<typeof createResourcesApi> }) {
    const queryClient = useQueryClient();
    const queryKey = resourceQueryKey(accountId, courseId);
    const resources = useQuery({ queryKey, queryFn: ({ signal }) => api.list(courseId, signal) });
    const [file, setFile] = useState<File | null>(null);
    const [lectureId, setLectureId] = useState("");
    const [operation, setOperation] = useState<ResourceOperation | null>(null);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState("");
    const [opening, setOpening] = useState<string | null>(null);
    const lifetime = useRef<AbortController | null>(null);
    const uploadController = useRef<AbortController | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const controller = new AbortController();
        lifetime.current = controller;

        return () => {
            controller.abort();
            uploadController.current?.abort();
        };
    }, []);

    async function upload() {
        if (!file || busy || !canManage) {
            return;
        }

        if (file.size === 0 || file.size > 25 * 1024 ** 2 || !file.name.toLowerCase().endsWith(".pdf")) {
            setError("Select a nonempty PDF up to 25 MB.");

            return;
        }

        const current = operation ?? { file, lectureId: lectureId || undefined, key: crypto.randomUUID() };
        const controller = new AbortController();
        uploadController.current = controller;
        setOperation(current);
        setBusy(true);
        setError("");
        setProgress(0);

        try {
            await api.upload(courseId, current, controller.signal, (value) => {
                if (!controller.signal.aborted) {
                    setProgress(value);
                }
            });

            if (lifetime.current?.signal.aborted) {
                return;
            }

            setOperation(null);
            setFile(null);

            if (fileInput.current) {
                fileInput.current.value = "";
            }
        } catch (error_) {
            if (!lifetime.current?.signal.aborted) {
                let message = "Upload failed. Please retry.";

                if (error_ instanceof Error) {
                    message = error_.message;
                }

                if (controller.signal.aborted) {
                    message = "Upload cancelled. Retry to resume this file.";
                }

                setError(message);
            }
        } finally {
            if (!lifetime.current?.signal.aborted) {
                setBusy(false);
                void queryClient.invalidateQueries({ queryKey });
            }
        }
    }

    async function open(resourceId: string) {
        const signal = lifetime.current?.signal;

        if (!signal || signal.aborted) {
            return;
        }

        const tab = window.open("about:blank", "_blank");

        if (tab) {
            tab.opener = null;
        }

        setOpening(resourceId);
        setError("");

        try {
            const url = await api.download(courseId, resourceId, signal);

            if (signal.aborted) {
                tab?.close();

                return;
            }

            if (tab) {
                tab.location.href = url;
            } else {
                setError("Allow popups and try opening the PDF again.");
            }
        } catch (error_) {
            tab?.close();

            if (!signal.aborted) {
                setError(error_ instanceof Error ? error_.message : "Could not open this PDF. Try again for a fresh link.");
            }
        } finally {
            if (!signal.aborted) {
                setOpening(null);
            }
        }
    }

    return (
        <section className="resources-container" aria-label="Course resources">
            <h2>Course Resources</h2>
            <p className="resources-desc">PDF lecture notes, assignments, and study guides shared with this course.</p>
            {canManage && (
                <div className="resources-card">
                    <label htmlFor="resource-file" className="resources-label">
                        PDF file (up to 25 MB)
                    </label>
                    <input
                        ref={fileInput}
                        id="resource-file"
                        type="file"
                        accept=".pdf,application/pdf"
                        disabled={busy || operation !== null}
                        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                        className="resources-input"
                    />
                    <label htmlFor="resource-lecture">Associated lecture</label>
                    <select
                        id="resource-lecture"
                        value={lectureId}
                        disabled={busy || operation !== null}
                        onChange={(event) => setLectureId(event.target.value)}
                        className="resources-input"
                    >
                        <option value="">Entire course</option>
                        {lectures.map((lecture) => (
                            <option key={lecture.id} value={lecture.id}>
                                {lecture.title}
                            </option>
                        ))}
                    </select>
                    <button type="button" className="resources-btn" disabled={!file || busy} onClick={() => void upload()}>
                        {operation ? "Retry upload" : "Upload PDF"}
                    </button>
                    {operation && !busy && (
                        <button
                            type="button"
                            className="resources-view-btn"
                            onClick={() => {
                                setOperation(null);
                                setFile(null);
                                setError("");

                                if (fileInput.current) {
                                    fileInput.current.value = "";
                                }
                            }}
                        >
                            Select another PDF
                        </button>
                    )}
                    {busy && (
                        <>
                            <progress max={100} value={progress} aria-label="File transfer progress" />
                            <p role="status">{progress === 100 ? "Verifying upload…" : `Transferring file: ${progress}%`}</p>
                            <button type="button" className="resources-view-btn" onClick={() => uploadController.current?.abort()}>
                                Cancel upload
                            </button>
                        </>
                    )}
                </div>
            )}
            {error && <p role="alert">{error}</p>}
            {resources.isPending && <p role="status">Loading resources…</p>}
            {resources.isError && (
                <p role="alert">
                    Could not load resources.{" "}
                    <button type="button" onClick={() => void resources.refetch()}>
                        Retry
                    </button>
                </p>
            )}
            {resources.isSuccess && resources.data.length === 0 && <p>No resources have been shared yet.</p>}
            <ul className="resources-list">
                {resources.data?.map((resource) => (
                    <li key={resource.id} className="resources-item">
                        <div>
                            <span className="resources-file-name">{resource.name}</span>
                            <p>
                                {Math.ceil(resource.contentLength / 1024)} KB ·{" "}
                                {resource.uploadStatus === "uploaded" ? "Available" : resource.uploadStatus}
                            </p>
                            {resource.lectureId && (
                                <p>{lectures.find((lecture) => lecture.id === resource.lectureId)?.title ?? "Associated lecture"}</p>
                            )}
                            {resource.uploadStatus === "pending" && (
                                <p>Awaiting upload verification. The uploading teacher can retry from their active upload.</p>
                            )}
                            {resource.uploadStatus === "failed" && (
                                <p>Upload failed. A teacher can select the file to start a new upload.</p>
                            )}
                        </div>
                        {resource.uploadStatus === "uploaded" && (
                            <button
                                type="button"
                                className="resources-view-btn"
                                disabled={opening !== null}
                                onClick={() => void open(resource.id)}
                            >
                                {opening === resource.id ? "Opening…" : "Open / download PDF"}
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}
