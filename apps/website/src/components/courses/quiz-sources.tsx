import { useAuth } from "../../api/auth/provider";
import type { QuizSource } from "../../api/quizzes/client";
import { createResourcesApi } from "../../api/resources/client";
import { useTranslation } from "../../i18n/use-translation";
import { formatTimestamp } from "../lectures/timestamp";
import { openInNewTab } from "./open-in-new-tab";
import { quizMessagesByLanguage } from "./quiz-messages";
import { useEffect, useMemo, useRef, useState } from "react";

interface QuizSourcesProps {
    courseId: string;
    sources: QuizSource[];
    onOpenLecture: (lectureId: string, startSeconds?: number) => void;
}

function sourceLocation(source: QuizSource, page: (page: number) => string) {
    if (source.pageNumber !== undefined) {
        return page(source.pageNumber);
    }

    return source.startSeconds === undefined ? undefined : formatTimestamp(source.startSeconds);
}

export default function QuizSources({ courseId, sources, onOpenLecture }: QuizSourcesProps) {
    const { language } = useTranslation();
    const messages = quizMessagesByLanguage[language];
    const { apiFetch } = useAuth();
    const resources = useMemo(() => createResourcesApi(apiFetch), [apiFetch]);
    const lifetime = useRef<AbortController | null>(null);
    const [openingResource, setOpeningResource] = useState<string | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        const controller = new AbortController();

        lifetime.current = controller;

        return () => controller.abort();
    }, []);

    async function openResource(source: QuizSource) {
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
                setError(messages.popupBlocked);
            }
        } catch (error_) {
            if (!signal.aborted) {
                setError(language === "en" && error_ instanceof Error ? error_.message : messages.openResourceFailed);
            }
        } finally {
            if (!signal.aborted) {
                setOpeningResource(null);
            }
        }
    }

    if (sources.length === 0) {
        return null;
    }

    return (
        <div className="quiz-sources">
            <span className="quiz-sources-label">{messages.sources}</span>

            <div className="quiz-source-list">
                {sources.map((source, index) => {
                    const location = sourceLocation(source, messages.page);
                    const label = location ? `${source.title} · ${location}` : source.title;

                    if (source.kind === "transcript" && source.lectureId) {
                        return (
                            <button
                                key={`${source.kind}-${source.lectureId}-${index}`}
                                type="button"
                                className="quiz-source"
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
                                className="quiz-source"
                                disabled={openingResource !== null}
                                onClick={() => void openResource(source)}
                            >
                                {openingResource === source.resourceId ? messages.opening : label}
                            </button>
                        );
                    }

                    return (
                        <span key={`${source.kind}-${index}`} className="quiz-source">
                            {label}
                        </span>
                    );
                })}
            </div>

            {error && (
                <p className="quiz-error" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}
