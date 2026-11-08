import { ApiError } from "../../api/auth/client";
import { useAuth } from "../../api/auth/provider";
import type { Lecture } from "../../api/lectures/types";
import { createResourcesApi } from "../../api/resources/client";
import { createStudyGuidesApi, studyGuideQueryKey, type StudyGuideSource } from "../../api/study-guides/client";
import { formatTimestamp } from "../lectures/timestamp";
import { openInNewTab } from "./open-in-new-tab";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

interface CourseStudyGuidesProps {
    courseId: string;
    lectures: Lecture[];
    canManage: boolean;
    onOpenLecture: (lectureId: string, startSeconds?: number) => void;
}

type StudyGuidesApi = ReturnType<typeof createStudyGuidesApi>;
type ResourcesApi = ReturnType<typeof createResourcesApi>;

interface StudyGuidePanelProps extends CourseStudyGuidesProps {
    accountId: string;
    api: StudyGuidesApi;
    resources: ResourcesApi;
}

export default function CourseStudyGuides(props: CourseStudyGuidesProps) {
    const { state, apiFetch } = useAuth();

    const api = useMemo(() => createStudyGuidesApi(apiFetch), [apiFetch]);

    const resources = useMemo(() => createResourcesApi(apiFetch), [apiFetch]);

    if (state.status !== "authenticated") {
        return null;
    }

    return (
        <StudyGuidePanel key={`${state.user.id}:${props.courseId}`} {...props} accountId={state.user.id} api={api} resources={resources} />
    );
}

function StudyGuidePanel({ courseId, lectures, canManage, onOpenLecture, accountId, api, resources }: StudyGuidePanelProps) {
    const queryClient = useQueryClient();

    const [lectureId, setLectureId] = useState("");
    const [selectedGuideId, setSelectedGuideId] = useState<string>();
    const [generating, setGenerating] = useState(false);
    const [deletingGuideId, setDeletingGuideId] = useState<string | null>(null);
    const [openingResource, setOpeningResource] = useState<string | null>(null);
    const [error, setError] = useState("");

    const lifetime = useRef<AbortController | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        lifetime.current = controller;

        return () => controller.abort();
    }, []);

    const listQueryKey = studyGuideQueryKey(accountId, courseId);

    const guides = useQuery({
        queryKey: listQueryKey,
        queryFn: ({ signal }) => api.list(courseId, undefined, signal),
        retry: false,
    });

    const selectedGuide = useQuery({
        queryKey: [...listQueryKey, "guide", selectedGuideId ?? "none"],
        queryFn: ({ signal }) => api.get(courseId, selectedGuideId!, signal),
        enabled: selectedGuideId !== undefined,
        retry: false,
    });

    useEffect(() => {
        if (selectedGuideId === undefined && guides.data && guides.data.length > 0) {
            setSelectedGuideId(guides.data[0].id);
        }
    }, [guides.data, selectedGuideId]);

    function guideScope(guideLectureId?: string) {
        if (!guideLectureId) {
            return "Entire course";
        }

        return lectures.find((lecture) => lecture.id === guideLectureId)?.title ?? "Lecture";
    }

    async function generateGuide() {
        if (!canManage || generating) {
            return;
        }

        const signal = lifetime.current?.signal;

        setGenerating(true);
        setError("");

        try {
            const guide = await api.generate(courseId, lectureId || undefined, signal);

            await queryClient.invalidateQueries({
                queryKey: listQueryKey,
            });

            setSelectedGuideId(guide.id);
        } catch (error_) {
            if (!signal?.aborted) {
                setError(
                    error_ instanceof ApiError
                        ? error_.message
                        : error_ instanceof Error
                          ? error_.message
                          : "Could not generate the study guide.",
                );
            }
        } finally {
            if (!signal?.aborted) {
                setGenerating(false);
            }
        }
    }

    async function deleteGuide(studyGuideId: string, title: string) {
        if (!canManage || deletingGuideId !== null) {
            return;
        }

        const confirmed = globalThis.confirm(`Delete "${title}"?\n\nThis study guide will be permanently removed.`);

        if (!confirmed) {
            return;
        }

        const signal = lifetime.current?.signal;

        setDeletingGuideId(studyGuideId);
        setError("");

        try {
            await api.remove(courseId, studyGuideId, signal);

            queryClient.removeQueries({
                queryKey: [...listQueryKey, "guide", studyGuideId],
                exact: true,
            });

            const nextGuide = guides.data?.find((guide) => guide.id !== studyGuideId);

            setSelectedGuideId(nextGuide?.id);

            await queryClient.invalidateQueries({
                queryKey: listQueryKey,
            });
        } catch (error_) {
            if (!signal?.aborted) {
                setError(
                    error_ instanceof ApiError
                        ? error_.message
                        : error_ instanceof Error
                          ? error_.message
                          : "Could not delete the study guide.",
                );
            }
        } finally {
            if (!signal?.aborted) {
                setDeletingGuideId(null);
            }
        }
    }

    async function openResource(source: StudyGuideSource) {
        const signal = lifetime.current?.signal;

        if (!signal || signal.aborted || !source.resourceId) {
            return;
        }

        setOpeningResource(source.resourceId);
        setError("");

        try {
            const outcome = await openInNewTab(async () => {
                const url = await resources.download(courseId, source.resourceId!, signal);

                if (source.pageNumber === undefined) {
                    return url;
                }

                return `${url}#page=${source.pageNumber}`;
            }, signal);

            if (outcome === "blocked") {
                setError("Allow popups and try opening the PDF again.");
            }
        } catch (error_) {
            if (!signal.aborted) {
                setError(error_ instanceof Error ? error_.message : "Could not open this PDF.");
            }
        } finally {
            if (!signal.aborted) {
                setOpeningResource(null);
            }
        }
    }

    return (
        <section className="study-guides-container" aria-label="Study guides">
            <header className="study-guides-header">
                <h2>Study Guides</h2>

                <p>Create and review study guides from lecture transcripts and course resources.</p>
            </header>

            {canManage && (
                <section className="study-guides-generate">
                    <div className="study-guides-generate-info">
                        <h3>Generate a study guide</h3>

                        <p>Create a guide for the entire course or choose one lecture to focus on.</p>
                    </div>

                    <div className="study-guides-generate-actions">
                        <label htmlFor="study-guide-scope">
                            <span>Study guide scope</span>

                            <select
                                id="study-guide-scope"
                                value={lectureId}
                                disabled={generating}
                                onChange={(event) => setLectureId(event.target.value)}
                            >
                                <option value="">Entire course</option>

                                {lectures.map((lecture) => (
                                    <option key={lecture.id} value={lecture.id}>
                                        {lecture.title}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <button
                            type="button"
                            className="study-guides-generate-button"
                            disabled={generating}
                            onClick={() => void generateGuide()}
                        >
                            {generating ? "Generating…" : "Generate guide"}
                        </button>
                    </div>
                </section>
            )}

            {error && (
                <p className="study-guides-error" role="alert">
                    {error}
                </p>
            )}

            <div className="study-guides-workspace">
                <aside className="study-guides-sidebar">
                    <div className="study-guides-sidebar-heading">
                        <h3>Available guides</h3>

                        {guides.data && <span>{guides.data.length === 1 ? "1 guide" : `${guides.data.length} guides`}</span>}
                    </div>

                    {guides.isPending && (
                        <p className="study-guides-status" role="status">
                            Loading study guides…
                        </p>
                    )}

                    {guides.isError && (
                        <div className="study-guides-load-error" role="alert">
                            <p>{guides.error instanceof ApiError ? guides.error.message : "Study guides are unavailable right now."}</p>

                            <button type="button" className="lecture-text-button" onClick={() => void guides.refetch()}>
                                Retry
                            </button>
                        </div>
                    )}

                    {guides.isSuccess && guides.data.length === 0 && (
                        <div className="study-guides-empty">
                            <h4>No study guides yet</h4>

                            <p>Generated guides will appear here.</p>
                        </div>
                    )}

                    {guides.isSuccess && guides.data.length > 0 && (
                        <ul className="study-guides-list">
                            {guides.data.map((guide) => {
                                const active = selectedGuideId === guide.id;

                                return (
                                    <li key={guide.id}>
                                        <button
                                            type="button"
                                            className={active ? "study-guide-card study-guide-card-active" : "study-guide-card"}
                                            onClick={() => setSelectedGuideId(guide.id)}
                                        >
                                            <span className="study-guide-card-title">{guide.title}</span>

                                            <span className="study-guide-card-scope">{guideScope(guide.lectureId)}</span>

                                            <span className="study-guide-card-meta">
                                                <span>{guide.sectionCount === 1 ? "1 section" : `${guide.sectionCount} sections`}</span>

                                                <span>{new Date(guide.createdAt).toLocaleDateString()}</span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </aside>

                <div className="study-guide-viewer">
                    {!selectedGuideId && (
                        <div className="study-guide-placeholder">
                            <h3>Select a study guide</h3>

                            <p>Choose a guide from the list to read the overview, key points, and source material.</p>
                        </div>
                    )}

                    {selectedGuideId && selectedGuide.isPending && (
                        <p className="study-guides-status" role="status">
                            Loading study guide…
                        </p>
                    )}

                    {selectedGuide.isError && (
                        <div className="study-guides-load-error" role="alert">
                            <p>
                                {selectedGuide.error instanceof ApiError ? selectedGuide.error.message : "Could not load this study guide."}
                            </p>

                            <button type="button" className="lecture-text-button" onClick={() => void selectedGuide.refetch()}>
                                Retry
                            </button>
                        </div>
                    )}

                    {selectedGuide.data && (
                        <article className="study-guide-document">
                            <header className="study-guide-document-header">
                                <div className="study-guide-document-heading">
                                    <span className="study-guide-document-scope">{guideScope(selectedGuide.data.lectureId)}</span>

                                    <h3>{selectedGuide.data.title}</h3>

                                    <span className="study-guide-document-meta">
                                        {selectedGuide.data.sectionCount === 1
                                            ? "1 section"
                                            : `${selectedGuide.data.sectionCount} sections`}
                                    </span>
                                </div>

                                {canManage && (
                                    <button
                                        type="button"
                                        className="study-guide-delete-button"
                                        disabled={deletingGuideId !== null}
                                        onClick={() => void deleteGuide(selectedGuide.data.id, selectedGuide.data.title)}
                                    >
                                        {deletingGuideId === selectedGuide.data.id ? "Deleting…" : "Delete guide"}
                                    </button>
                                )}
                            </header>

                            <section className="study-guide-overview">
                                <h4>Overview</h4>

                                <p>{selectedGuide.data.overview}</p>

                                <SourceList
                                    sources={selectedGuide.data.overviewSources}
                                    openingResource={openingResource}
                                    onOpenLecture={onOpenLecture}
                                    onOpenResource={(source) => void openResource(source)}
                                />
                            </section>

                            <div className="study-guide-sections">
                                {selectedGuide.data.sections.map((section, index) => (
                                    <section key={section.id} className="study-guide-section">
                                        <div className="study-guide-section-number">{index + 1}</div>

                                        <div className="study-guide-section-body">
                                            <h4>{section.heading}</h4>

                                            <p className="study-guide-section-content">{section.content}</p>

                                            <div className="study-guide-key-points">
                                                <h5>Key points</h5>

                                                <ul>
                                                    {section.keyPoints.map((point, pointIndex) => (
                                                        <li key={`${section.id}-${pointIndex}`}>{point}</li>
                                                    ))}
                                                </ul>
                                            </div>

                                            <SourceList
                                                sources={section.sources}
                                                openingResource={openingResource}
                                                onOpenLecture={onOpenLecture}
                                                onOpenResource={(source) => void openResource(source)}
                                            />
                                        </div>
                                    </section>
                                ))}
                            </div>
                        </article>
                    )}
                </div>
            </div>
        </section>
    );
}

interface SourceListProps {
    sources: StudyGuideSource[];
    openingResource: string | null;
    onOpenLecture: (lectureId: string, startSeconds?: number) => void;
    onOpenResource: (source: StudyGuideSource) => void;
}

function SourceList({ sources, openingResource, onOpenLecture, onOpenResource }: SourceListProps) {
    if (sources.length === 0) {
        return null;
    }

    return (
        <div className="study-guide-sources">
            <span className="study-guide-sources-label">Sources</span>

            <div className="study-guide-source-list">
                {sources.map((source, index) => {
                    const location =
                        source.pageNumber === undefined
                            ? source.startSeconds === undefined
                                ? undefined
                                : formatTimestamp(source.startSeconds)
                            : `Page ${source.pageNumber}`;

                    const label = location ? `${source.title} · ${location}` : source.title;

                    if (source.kind === "transcript" && source.lectureId) {
                        return (
                            <button
                                key={`${source.kind}-${source.lectureId}-${index}`}
                                type="button"
                                className="study-guide-source"
                                onClick={() => onOpenLecture(source.lectureId!, source.startSeconds)}
                            >
                                {label}
                            </button>
                        );
                    }

                    if (source.kind === "resource" && source.resourceId) {
                        return (
                            <button
                                key={`${source.kind}-${source.resourceId}-${index}`}
                                type="button"
                                className="study-guide-source"
                                disabled={openingResource !== null}
                                onClick={() => onOpenResource(source)}
                            >
                                {openingResource === source.resourceId ? "Opening…" : label}
                            </button>
                        );
                    }

                    return (
                        <span key={`${source.kind}-${index}`} className="study-guide-source">
                            {label}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
