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

interface StudyGuidePanelProps extends CourseStudyGuidesProps {
    accountId: string;
    api: ReturnType<typeof createStudyGuidesApi>;
    resources: ReturnType<typeof createResourcesApi>;
}

function StudyGuidePanel({ courseId, lectures, canManage, onOpenLecture, accountId, api, resources }: StudyGuidePanelProps) {
    const queryClient = useQueryClient();

    const [lectureId, setLectureId] = useState("");
    const [selectedGuideId, setSelectedGuideId] = useState<string>();
    const [generating, setGenerating] = useState(false);
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
        queryKey: [...listQueryKey, "detail", selectedGuideId ?? "none"],
        queryFn: ({ signal }) => api.get(courseId, selectedGuideId!, signal),
        enabled: selectedGuideId !== undefined,
        retry: false,
    });

    async function generateGuide() {
        if (!canManage || generating) {
            return;
        }

        setGenerating(true);
        setError("");

        try {
            const guide = await api.generate(courseId, lectureId || undefined, lifetime.current?.signal);

            await queryClient.invalidateQueries({
                queryKey: listQueryKey,
            });

            setSelectedGuideId(guide.id);
        } catch (error_) {
            if (!lifetime.current?.signal.aborted) {
                setError(
                    error_ instanceof ApiError
                        ? error_.message
                        : error_ instanceof Error
                          ? error_.message
                          : "Could not generate the study guide.",
                );
            }
        } finally {
            if (!lifetime.current?.signal.aborted) {
                setGenerating(false);
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

                return source.pageNumber === undefined ? url : `${url}#page=${source.pageNumber}`;
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

    function guideScope(guideLectureId?: string) {
        if (!guideLectureId) {
            return "Entire course";
        }

        return lectures.find((lecture) => lecture.id === guideLectureId)?.title ?? "Lecture";
    }

    return (
        <section className="study-guides-container" aria-label="Study guides">
            <div className="study-guides-heading">
                <div>
                    <h2>Study Guides</h2>
                    <p className="study-guides-desc">Review AI-generated study guides based on lecture transcripts and course resources.</p>
                </div>
            </div>

            {canManage && (
                <div className="study-guides-generate-card">
                    <div>
                        <h3>Generate a study guide</h3>
                        <p>
                            Choose the entire course or one lecture. The guide will use indexed transcripts and PDF resources as source
                            material.
                        </p>
                    </div>

                    <label htmlFor="study-guide-scope">Content</label>

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

                    <button type="button" className="resources-btn" disabled={generating} onClick={() => void generateGuide()}>
                        {generating ? "Generating�" : "Generate study guide"}
                    </button>
                </div>
            )}

            {error && <p role="alert">{error}</p>}

            <div className="study-guides-layout">
                <div className="study-guides-library">
                    <h3>Available guides</h3>

                    {guides.isPending && <p role="status">Loading study guides�</p>}

                    {guides.isError && (
                        <p role="alert">
                            {guides.error instanceof ApiError ? guides.error.message : "Study guides are unavailable."}{" "}
                            <button type="button" onClick={() => void guides.refetch()}>
                                Retry
                            </button>
                        </p>
                    )}

                    {guides.isSuccess && guides.data.length === 0 && (
                        <p className="study-guides-empty">No study guides have been generated yet.</p>
                    )}

                    {guides.isSuccess && guides.data.length > 0 && (
                        <ul className="study-guides-list">
                            {guides.data.map((guide) => {
                                const active = selectedGuideId === guide.id;

                                return (
                                    <li key={guide.id}>
                                        <button
                                            type="button"
                                            className={
                                                active
                                                    ? "study-guide-list-button study-guide-list-button-active"
                                                    : "study-guide-list-button"
                                            }
                                            onClick={() => setSelectedGuideId(guide.id)}
                                        >
                                            <span className="study-guide-list-title">{guide.title}</span>

                                            <span className="study-guide-list-meta">
                                                {guideScope(guide.lectureId)}
                                                {" � "}
                                                {guide.sectionCount === 1 ? "1 section" : `${guide.sectionCount} sections`}
                                            </span>

                                            <span className="study-guide-list-date">{new Date(guide.createdAt).toLocaleDateString()}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                <div className="study-guide-viewer">
                    {!selectedGuideId && (
                        <div className="study-guide-placeholder">
                            <h3>Select a study guide</h3>
                            <p>Choose a guide from the list to read its overview, key points, and sources.</p>
                        </div>
                    )}

                    {selectedGuide.isPending && selectedGuideId && <p role="status">Loading study guide�</p>}

                    {selectedGuide.isError && (
                        <p role="alert">
                            {selectedGuide.error instanceof ApiError ? selectedGuide.error.message : "Could not load this study guide."}{" "}
                            <button type="button" onClick={() => void selectedGuide.refetch()}>
                                Retry
                            </button>
                        </p>
                    )}

                    {selectedGuide.data && (
                        <article className="study-guide-content">
                            <header className="study-guide-content-heading">
                                <p className="study-guide-scope">{guideScope(selectedGuide.data.lectureId)}</p>

                                <h3>{selectedGuide.data.title}</h3>
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
                                {selectedGuide.data.sections.map((section) => (
                                    <section key={section.id} className="study-guide-section">
                                        <h4>{section.heading}</h4>

                                        <p>{section.content}</p>

                                        <h5>Key points</h5>

                                        <ul>
                                            {section.keyPoints.map((point, index) => (
                                                <li key={`${section.id}-${index}`}>{point}</li>
                                            ))}
                                        </ul>

                                        <SourceList
                                            sources={section.sources}
                                            openingResource={openingResource}
                                            onOpenLecture={onOpenLecture}
                                            onOpenResource={(source) => void openResource(source)}
                                        />
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

                    if (source.kind === "transcript" && source.lectureId) {
                        return (
                            <button
                                key={`${source.kind}-${source.lectureId}-${index}`}
                                type="button"
                                className="study-guide-source"
                                onClick={() => onOpenLecture(source.lectureId!, source.startSeconds)}
                            >
                                {source.title}
                                {location && ` � ${location}`}
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
                                {openingResource === source.resourceId ? "Opening�" : `${source.title}${location ? ` � ${location}` : ""}`}
                            </button>
                        );
                    }

                    return (
                        <span key={`${source.kind}-${index}`} className="study-guide-source">
                            {source.title}
                            {location && ` � ${location}`}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
