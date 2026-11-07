import { useAuth } from "../../api/auth/provider";
import type { Lecture } from "../../api/lectures/types";
import { createResourcesApi, resourceIndexingNote, resourceQueryKey } from "../../api/resources/client";
import type { ResourceOperation } from "../../api/resources/client";
import { openInNewTab } from "./open-in-new-tab";
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

interface QueuedFile {
    id: string;
    file: File;
    operation?: ResourceOperation;
    status: "waiting" | "uploading" | "failed";
    progress: number;
    error?: string;
}

const MAX_RESOURCE_BYTES = 25 * 1024 ** 2;

function isUploadablePdf(file: File) {
    return file.size > 0 && file.size <= MAX_RESOURCE_BYTES && file.name.toLowerCase().endsWith(".pdf");
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
    const [queue, setQueue] = useState<QueuedFile[]>([]);
    const [lectureId, setLectureId] = useState("");
    const [busy, setBusy] = useState(false);
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

    function updateQueued(id: string, patch: Partial<QueuedFile>) {
        setQueue((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    }

    function select(files: FileList | null) {
        const chosen = [...(files ?? [])];
        const skipped = chosen.filter((file) => !isUploadablePdf(file)).map((file) => file.name);
        const accepted: QueuedFile[] = chosen
            .filter((file) => isUploadablePdf(file))
            .map((file) => ({ id: crypto.randomUUID(), file, status: "waiting", progress: 0 }));

        setQueue((current) => [...current, ...accepted]);
        setError(skipped.length > 0 ? `Skipped ${skipped.join(", ")}. Each file must be a nonempty PDF up to 25 MB.` : "");

        if (fileInput.current) {
            fileInput.current.value = "";
        }
    }

    async function uploadQueued() {
        if (busy || !canManage || queue.length === 0) {
            return;
        }

        const controller = new AbortController();
        uploadController.current = controller;
        setBusy(true);
        setError("");

        for (const item of queue) {
            if (controller.signal.aborted || lifetime.current?.signal.aborted) {
                break;
            }

            const operation = item.operation ?? { file: item.file, lectureId: lectureId || undefined, key: crypto.randomUUID() };
            updateQueued(item.id, { operation, status: "uploading", progress: 0, error: undefined });

            try {
                await api.upload(courseId, operation, controller.signal, (value) => {
                    if (!controller.signal.aborted) {
                        updateQueued(item.id, { progress: value });
                    }
                });

                setQueue((current) => current.filter((queued) => queued.id !== item.id));
            } catch (error_) {
                if (lifetime.current?.signal.aborted) {
                    return;
                }

                let message = error_ instanceof Error ? error_.message : "Upload failed. Please retry.";

                if (controller.signal.aborted) {
                    message = "Upload cancelled. Retry to resume this file.";
                }

                updateQueued(item.id, { status: "failed", error: message });
            }

            void queryClient.invalidateQueries({ queryKey });
        }

        if (!lifetime.current?.signal.aborted) {
            setBusy(false);
        }
    }

    async function open(resourceId: string) {
        const signal = lifetime.current?.signal;

        if (!signal || signal.aborted) {
            return;
        }

        setOpening(resourceId);
        setError("");

        try {
            const outcome = await openInNewTab(() => api.download(courseId, resourceId, signal), signal);

            if (outcome === "blocked") {
                setError("Allow popups and try opening the PDF again.");
            }
        } catch (error_) {
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
                        PDF files (up to 25 MB each)
                    </label>
                    <input
                        ref={fileInput}
                        id="resource-file"
                        type="file"
                        multiple
                        accept=".pdf,application/pdf"
                        disabled={busy}
                        onChange={(event) => select(event.target.files)}
                        className="resources-input"
                    />
                    <label htmlFor="resource-lecture">Associated lecture</label>
                    <select
                        id="resource-lecture"
                        value={lectureId}
                        disabled={busy || queue.some((item) => item.operation)}
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
                    {queue.length > 0 && (
                        <ul className="resources-queue" aria-label="Files to upload">
                            {queue.map((item) => (
                                <li key={item.id} className="resources-queue-item">
                                    <span className="resources-file-name">{item.file.name}</span>
                                    {item.status === "waiting" && <p>{item.operation ? "Waiting to retry" : "Ready to upload"}</p>}
                                    {item.status === "uploading" && (
                                        <>
                                            <progress max={100} value={item.progress} aria-label={`${item.file.name} transfer progress`} />
                                            <p role="status">
                                                {item.progress === 100 ? "Verifying upload…" : `Transferring file: ${item.progress}%`}
                                            </p>
                                        </>
                                    )}
                                    {item.status === "failed" && <p role="alert">{item.error}</p>}
                                    {!busy && (
                                        <button
                                            type="button"
                                            className="resources-view-btn"
                                            onClick={() => setQueue((current) => current.filter((queued) => queued.id !== item.id))}
                                        >
                                            Remove
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                    <button
                        type="button"
                        className="resources-btn"
                        disabled={queue.length === 0 || busy}
                        onClick={() => void uploadQueued()}
                    >
                        {queue.length > 1 ? `Upload ${queue.length} PDFs` : "Upload PDF"}
                    </button>
                    {busy && (
                        <button type="button" className="resources-view-btn" onClick={() => uploadController.current?.abort()}>
                            Cancel upload
                        </button>
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
                            {resourceIndexingNote(resource) && <p>{resourceIndexingNote(resource)}</p>}
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
