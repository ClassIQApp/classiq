import type { CourseRole } from "../../api/courses/types";
import { isFixtureProvider } from "../../api/lectures/content";
import type { KeyTerms, SpanishTranscript, Summary, Transcript } from "../../api/lectures/content";
import { displayError, stageStatus } from "../../api/lectures/processing";
import type { LectureProcessing, ProcessingStageName } from "../../api/lectures/processing";
import type { LectureStatus } from "../../api/lectures/types";
import { TimestampButton } from "./timestamp";
import type { UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";

export type StudyOutput = "summary" | "key_terms" | "transcript";

const outputDescription: Record<StudyOutput, { stage: ProcessingStageName; noun: string; verb: "is" | "are"; label: string }> = {
    summary: { stage: "summary", noun: "The summary", verb: "is", label: "the summary" },
    key_terms: { stage: "key_terms", noun: "Key terms", verb: "are", label: "key terms" },
    transcript: { stage: "transcription", noun: "The transcript", verb: "is", label: "the transcript" },
};

const SUMMARY_CLAMP_CHARACTERS = 480;

const KEY_TERMS_PREVIEW = 8;

export interface StudyContent {
    transcript: UseQueryResult<Transcript | null>;
    spanish: UseQueryResult<SpanishTranscript | null>;
    summary: UseQueryResult<Summary | null>;
    keyTerms: UseQueryResult<KeyTerms | null>;
}

export interface MaterialContext {
    processing: LectureProcessing | undefined;
    fallbackStatus: LectureStatus;
    role: CourseRole;
}

interface OutputPlaceholderProps extends MaterialContext {
    output: StudyOutput;
    query: UseQueryResult<unknown>;
}

interface SummarySectionProps extends MaterialContext {
    content: StudyContent;
}

interface KeyTermsSectionProps extends MaterialContext {
    content: StudyContent;
    onSeek: (seconds: number) => void;
}

function unavailableMessage(output: StudyOutput, { processing, fallbackStatus, role }: MaterialContext) {
    const { stage, noun, verb } = outputDescription[output];
    const status = processing?.status ?? fallbackStatus;
    const stageState = stageStatus(processing, stage);

    if (stageState === "failed" && status !== "processing") {
        return `${noun} couldn't be prepared.${role === "teacher" ? " Retry processing to try again." : ""}`;
    }

    if (status === "processing") {
        return `${noun} ${verb} still being prepared and will appear here automatically.`;
    }

    if (status === "pending") {
        return `${noun} will be prepared after the recording is uploaded.`;
    }

    if (status === "uploaded") {
        return `${noun} will be prepared once the recording is processed.`;
    }

    if (status === "failed") {
        return `${noun} wasn't prepared because processing stopped.`;
    }

    return `${noun} ${verb} not available for this lecture.`;
}

export function OutputPlaceholder({ output, query, ...context }: OutputPlaceholderProps) {
    if (query.isPending) {
        return <p className="lecture-muted">Loading…</p>;
    }

    if (query.isError) {
        return (
            <div className="lecture-panel-message">
                <p>
                    Couldn’t load {outputDescription[output].label}. {displayError(query.error)}
                </p>
                <button type="button" className="lecture-text-button" disabled={query.isFetching} onClick={() => void query.refetch()}>
                    {query.isFetching ? "Loading…" : "Try again"}
                </button>
            </div>
        );
    }

    return <p className="lecture-panel-message">{unavailableMessage(output, context)}</p>;
}

interface ProvenanceProps {
    content: StudyContent;
}

export function Provenance({ content }: ProvenanceProps) {
    const transcript = content.transcript.data;
    const generated = content.summary.data ?? content.keyTerms.data;
    const fixture = [transcript?.provider, content.summary.data?.provider, content.keyTerms.data?.provider].some(
        (provider) => provider && isFixtureProvider(provider),
    );
    const sources = [
        transcript && `Transcript: ${transcript.provider} (${transcript.model})`,
        generated && `Summary and key terms: ${generated.provider} (${generated.model})`,
    ].filter(Boolean);

    if (sources.length === 0) {
        return null;
    }

    return (
        <p className="lecture-provenance">
            {fixture && <span className="lecture-fixture-badge">Development fixture output</span>}
            Generated automatically and may contain mistakes. {sources.join(" · ")}
        </p>
    );
}

function StaleNote() {
    return <p className="lecture-stale-note">Generated from an earlier version of the transcript.</p>;
}

export function SummarySection({ content, ...context }: SummarySectionProps) {
    const [expanded, setExpanded] = useState(false);
    const summary = content.summary.data;
    const sourceHash = content.transcript.data?.contentHash;
    const long = (summary?.content.text.length ?? 0) > SUMMARY_CLAMP_CHARACTERS;

    return (
        <section className="lecture-card lecture-summary-card" aria-labelledby="lecture-summary-heading">
            <h2 id="lecture-summary-heading">Summary</h2>
            {summary ? (
                <>
                    {sourceHash && summary.sourceHash !== sourceHash && <StaleNote />}
                    <div className={long && !expanded ? "lecture-summary is-clamped" : "lecture-summary"}>
                        {summary.content.text
                            .split(/\n\s*\n/)
                            .map((paragraph) => paragraph.trim())
                            .filter(Boolean)
                            .map((paragraph, index) => (
                                <p key={index}>{paragraph}</p>
                            ))}
                    </div>
                    {long && (
                        <button
                            type="button"
                            className="lecture-text-button"
                            aria-expanded={expanded}
                            onClick={() => setExpanded(!expanded)}
                        >
                            {expanded ? "Show less" : "Read full summary"}
                        </button>
                    )}
                </>
            ) : (
                <OutputPlaceholder output="summary" query={content.summary} {...context} />
            )}
        </section>
    );
}

export function KeyTermsSection({ content, onSeek, ...context }: KeyTermsSectionProps) {
    const [showAll, setShowAll] = useState(false);
    const keyTerms = content.keyTerms.data;
    const sourceHash = content.transcript.data?.contentHash;
    const terms = keyTerms?.content.terms ?? [];
    const visible = showAll ? terms : terms.slice(0, KEY_TERMS_PREVIEW);

    return (
        <section className="lecture-card lecture-terms-card" aria-labelledby="lecture-terms-heading">
            <h2 id="lecture-terms-heading">Key terms {terms.length > 0 && <span className="lecture-count">{terms.length}</span>}</h2>
            {keyTerms ? (
                <>
                    {sourceHash && keyTerms.sourceHash !== sourceHash && <StaleNote />}
                    <ul className="lecture-key-terms" role="list">
                        {visible.map((term, index) => (
                            <li key={`${index}:${term.term}`}>
                                <details className="lecture-key-term">
                                    <summary>{term.term}</summary>
                                    <p>{term.explanation}</p>
                                    {term.sources.length > 0 && (
                                        <span className="lecture-key-term-sources">
                                            {term.sources.map((source, sourceIndex) => (
                                                <TimestampButton
                                                    key={`${sourceIndex}:${source.startSeconds}`}
                                                    seconds={source.startSeconds}
                                                    onSeek={onSeek}
                                                />
                                            ))}
                                        </span>
                                    )}
                                </details>
                            </li>
                        ))}
                    </ul>
                    {terms.length > KEY_TERMS_PREVIEW && (
                        <button type="button" className="lecture-text-button" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
                            {showAll ? "Show fewer" : `Show all ${terms.length} terms`}
                        </button>
                    )}
                </>
            ) : (
                <OutputPlaceholder output="key_terms" query={content.keyTerms} {...context} />
            )}
        </section>
    );
}
