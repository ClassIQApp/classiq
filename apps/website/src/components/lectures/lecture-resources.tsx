import { useAuth } from "../../api/auth/provider";
import { displayError } from "../../api/lectures/processing";
import type { LectureContentLink } from "../../api/lectures/types";
import { createResourcesApi, resourceIndexingNote, resourceQueryKey } from "../../api/resources/client";
import { openInNewTab } from "../courses/open-in-new-tab";
import { FilePdfIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

interface LectureResourcesProps {
    accountId: string;
    courseId: string;
    lectureId: string;
    legacyLinks: LectureContentLink[];
}

export default function LectureResources({ accountId, courseId, lectureId, legacyLinks }: LectureResourcesProps) {
    const { apiFetch } = useAuth();
    const api = useMemo(() => createResourcesApi(apiFetch), [apiFetch]);
    const resources = useQuery({ queryKey: resourceQueryKey(accountId, courseId), queryFn: ({ signal }) => api.list(courseId, signal) });
    const [opening, setOpening] = useState<string | null>(null);
    const [error, setError] = useState("");
    const lifetime = useRef<AbortController | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        lifetime.current = controller;

        return () => controller.abort();
    }, []);

    const attached = (resources.data ?? []).filter((resource) => resource.lectureId === lectureId && resource.uploadStatus === "uploaded");

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
                setError(error_ instanceof Error ? displayError(error_) : "Couldn't open this PDF. Try again for a fresh link.");
            }
        } finally {
            if (!signal.aborted) {
                setOpening(null);
            }
        }
    }

    if (attached.length === 0 && legacyLinks.length === 0 && !resources.isError) {
        return null;
    }

    return (
        <section className="lecture-resources" aria-labelledby="lecture-resources-heading">
            <h2 id="lecture-resources-heading">Lecture resources</h2>
            {resources.isError && (
                <p className="lecture-panel-message">
                    Couldn’t load this lecture’s resources.{" "}
                    <button type="button" className="lecture-text-button" onClick={() => void resources.refetch()}>
                        Try again
                    </button>
                </p>
            )}
            {error && <p role="alert">{error}</p>}
            <ul className="lecture-resource-list" role="list">
                {attached.map((resource) => (
                    <li key={resource.id}>
                        <button
                            type="button"
                            className="lecture-resource"
                            disabled={opening !== null}
                            onClick={() => void open(resource.id)}
                        >
                            <FilePdfIcon size={24} aria-hidden />
                            <span>
                                <strong>{resource.name}</strong>
                                <span>
                                    {opening === resource.id ? "Opening…" : `PDF · ${Math.ceil(resource.contentLength / 1024)} KB`}
                                    {resourceIndexingNote(resource) ? ` · ${resourceIndexingNote(resource)}` : ""}
                                </span>
                            </span>
                        </button>
                    </li>
                ))}
                {legacyLinks.map((link) => (
                    <li key={link.id}>
                        <a className="lecture-resource" href={link.href} target="_blank" rel="noreferrer">
                            <FilePdfIcon size={24} aria-hidden />
                            <span>
                                <strong>{link.title}</strong>
                                <span>
                                    {link.description}
                                    <span className="lecture-sr-only"> (opens in a new tab)</span>
                                </span>
                            </span>
                        </a>
                    </li>
                ))}
            </ul>
        </section>
    );
}
