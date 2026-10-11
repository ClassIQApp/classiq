import type { Lecture, LectureContentLink } from "../../types/lecture";
import LectureStatus from "./lecture-status";
import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react";

function ContentSection({
    title,
    description,
    links,
    emptyMessage,
}: {
    title: string;
    description: string;
    links: LectureContentLink[];
    emptyMessage: string;
}) {
    return (
        <section className="lecture-content-section" aria-label={title}>
            <h2>{title}</h2>
            <p className="lecture-section-description">{description}</p>
            {links.length > 0 ? (
                <ul className="lecture-content-links" role="list">
                    {links.map((link) => (
                        <li key={link.id}>
                            <a href={link.href} target="_blank" rel="noreferrer">
                                <span>
                                    <strong>{link.title}</strong>
                                    <span>{link.description}</span>
                                </span>
                                <ArrowRightIcon size={20} aria-hidden />
                                <span className="lecture-sr-only"> (opens in a new tab)</span>
                            </a>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="lecture-content-unavailable">{emptyMessage}</p>
            )}
        </section>
    );
}

export default function LectureDetail({ lecture, onBack }: { lecture: Lecture; onBack: () => void }) {
    const pendingMessage =
        lecture.status === "processing"
            ? "This content will appear when processing finishes."
            : lecture.status === "failed"
              ? "This content is unavailable because lecture processing failed."
              : "No content has been added yet.";

    return (
        <div className="lecture-detail">
            <button type="button" className="lecture-text-button" onClick={onBack}>
                <ArrowLeftIcon size={18} aria-hidden /> Back to lectures
            </button>
            <LectureStatus status={lecture.status} />
            <p>{lecture.description}</p>
            <div className={`lecture-state-message lecture-state-${lecture.status}`}>
                <strong>
                    {lecture.status === "ready"
                        ? "Ready to review"
                        : lecture.status === "processing"
                          ? "Preparing your lecture"
                          : "Processing failed"}
                </strong>
                <p>{lecture.statusMessage}</p>
            </div>
            <div className="lecture-content-grid">
                <ContentSection
                    title="Transcript"
                    description="Revisit what was said during the lecture."
                    links={lecture.transcript ? [lecture.transcript] : []}
                    emptyMessage={pendingMessage}
                />
                <ContentSection
                    title="Resources"
                    description="Read the course materials supporting this lecture."
                    links={lecture.resources}
                    emptyMessage="No resources have been added to this lecture yet."
                />
                <ContentSection
                    title="Generated content"
                    description="Review study notes and practice what you learned."
                    links={lecture.generatedContent}
                    emptyMessage={pendingMessage}
                />
            </div>
        </div>
    );
}
