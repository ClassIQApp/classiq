import type { SpanishTranscript, Transcript, TranscriptSegment } from "../../api/lectures/content";
import { formatTimestamp } from "./timestamp";
import { memo, useEffect, useMemo, useRef, useState } from "react";

type DisplayMode = "original" | "es" | "both";

const PARAGRAPH_TARGET_SECONDS = 25;

const PARAGRAPH_MAX_SECONDS = 60;

const PARAGRAPH_PAUSE_SECONDS = 2.5;

interface TranscriptViewProps {
    transcript: Transcript;
    spanish: SpanishTranscript | null | undefined;
    spanishLoading: boolean;
    playhead: number;
    onSeek: (seconds: number) => void;
}

interface Phrase {
    index: number;
    startSeconds: number;
    text: string;
    translation?: string;
}

interface Paragraph {
    key: string;
    startSeconds: number;
    speakerLabel?: string;
    phrases: Phrase[];
}

interface ParagraphRowProps {
    paragraph: Paragraph;
    mode: DisplayMode;
    sourceLanguage: string;
    showSpeaker: boolean;
    currentPhrase: number | null;
    onSeek: (seconds: number) => void;
}

function groupParagraphs(source: TranscriptSegment[], spanish: TranscriptSegment[] | undefined) {
    const paragraphs: Paragraph[] = [];
    let current: Paragraph | undefined;
    let previous: TranscriptSegment | undefined;

    for (const [index, segment] of source.entries()) {
        const duration = current ? segment.endSeconds - current.startSeconds : 0;
        const sentenceEnded = !!previous && /[.?!…]["”')\]]*$/.test(previous.text.trim());
        const startNew =
            !current ||
            !previous ||
            segment.startSeconds - previous.endSeconds >= PARAGRAPH_PAUSE_SECONDS ||
            segment.speakerLabel !== previous.speakerLabel ||
            duration > PARAGRAPH_MAX_SECONDS ||
            (sentenceEnded && segment.startSeconds - current.startSeconds >= PARAGRAPH_TARGET_SECONDS);

        if (startNew) {
            current = {
                key: `${index}:${segment.startSeconds}`,
                startSeconds: segment.startSeconds,
                speakerLabel: segment.speakerLabel,
                phrases: [],
            };
            paragraphs.push(current);
        }

        current!.phrases.push({
            index,
            startSeconds: segment.startSeconds,
            text: segment.text,
            translation: (spanish?.[index]?.text ?? segment.spanish)?.trim() || undefined,
        });
        previous = segment;
    }

    return paragraphs;
}

function lastStartedIndex<T extends { startSeconds: number }>(items: T[], seconds: number) {
    let low = 0;
    let high = items.length - 1;
    let found = -1;

    while (low <= high) {
        const middle = (low + high) >> 1;

        if (items[middle]!.startSeconds <= seconds) {
            found = middle;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }

    return found;
}

function languageName(code: string) {
    try {
        return new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code.toUpperCase();
    } catch {
        return code.toUpperCase();
    }
}

const ParagraphRow = memo(function ParagraphRow({
    paragraph,
    mode,
    sourceLanguage,
    showSpeaker,
    currentPhrase,
    onSeek,
}: ParagraphRowProps) {
    const time = formatTimestamp(paragraph.startSeconds);
    const primaryIsSpanish = mode === "es";

    return (
        <li className={currentPhrase === null ? "lecture-paragraph" : "lecture-paragraph is-current"}>
            <button
                type="button"
                className="lecture-paragraph-time"
                aria-label={`Play recording from ${time}`}
                onClick={() => onSeek(paragraph.startSeconds)}
            >
                {time}
            </button>
            <div className="lecture-paragraph-body">
                {showSpeaker && paragraph.speakerLabel && (
                    <span className="lecture-speaker">Speaker {paragraph.speakerLabel.replace(/^S/, "")}</span>
                )}
                <p lang={primaryIsSpanish ? "es" : sourceLanguage}>
                    {mode === "both" && <span className="lecture-lang-tag">{sourceLanguage.toUpperCase()}</span>}
                    {paragraph.phrases.map((phrase) => {
                        const untranslated = primaryIsSpanish && !phrase.translation;
                        const classes = [
                            "lecture-phrase",
                            phrase.index === currentPhrase && "is-current",
                            untranslated && "is-untranslated",
                        ];

                        return (
                            <span
                                key={phrase.index}
                                className={classes.filter(Boolean).join(" ")}
                                onClick={() => onSeek(phrase.startSeconds)}
                            >
                                {primaryIsSpanish ? (phrase.translation ?? phrase.text) : phrase.text}{" "}
                            </span>
                        );
                    })}
                </p>
                {mode === "both" && (
                    <p lang="es" className="lecture-paragraph-translation">
                        <span className="lecture-lang-tag lecture-lang-tag-es">ES</span>
                        {paragraph.phrases.map((phrase) => phrase.translation ?? "").join(" ") || "Not translated."}
                    </p>
                )}
            </div>
        </li>
    );
});

export default function TranscriptView({ transcript, spanish, spanishLoading, playhead, onSeek }: TranscriptViewProps) {
    const [mode, setMode] = useState<DisplayMode>("original");
    const [following, setFollowing] = useState(true);
    const list = useRef<HTMLOListElement>(null);
    const spanishAvailable = transcript.translationStatus === "succeeded" && !!spanish;
    const effectiveMode = spanishAvailable ? mode : "original";
    const sourceLanguage = transcript.language || "en";

    const paragraphs = useMemo(
        () => groupParagraphs(transcript.segments, spanishAvailable ? spanish.segments : undefined),
        [transcript.segments, spanishAvailable, spanish],
    );
    const showSpeaker = useMemo(
        () => new Set(transcript.segments.map((segment) => segment.speakerLabel).filter(Boolean)).size > 1,
        [transcript.segments],
    );

    const currentParagraph = lastStartedIndex(paragraphs, playhead);
    const currentPhrase = currentParagraph >= 0 ? lastStartedIndex(paragraphs[currentParagraph]!.phrases, playhead) : -1;
    const mounted = useRef(false);

    useEffect(() => {
        // Skip the first render so opening a lecture never jumps the page to the transcript.
        if (!mounted.current) {
            mounted.current = true;

            return;
        }

        const container = list.current;
        const row = container?.children[currentParagraph] as HTMLElement | undefined;

        if (!following || !container || !row) {
            return;
        }

        if (container.scrollHeight > container.clientHeight) {
            container.scrollTo({ top: row.offsetTop - container.offsetTop - container.clientHeight / 3, behavior: "smooth" });
        } else {
            row.scrollIntoView({ block: "center", behavior: "smooth" });
        }
    }, [currentParagraph, following]);

    const modes: { mode: DisplayMode; label: string; lang?: string }[] = [
        { mode: "original", label: languageName(sourceLanguage), lang: sourceLanguage },
        { mode: "es", label: "Español", lang: "es" },
        { mode: "both", label: "Both" },
    ];

    let translationNote = "";

    if (transcript.translationStatus === "failed" || (transcript.translationStatus === "succeeded" && spanish === null)) {
        translationNote = "A Spanish translation isn't available for this lecture.";
    }

    return (
        <div className="lecture-transcript">
            <div className="lecture-transcript-toolbar">
                {transcript.translationStatus === "succeeded" && spanish !== null && (
                    <div className="lecture-segmented" role="group" aria-label="Transcript language">
                        {modes.map((item) => (
                            <button
                                key={item.mode}
                                type="button"
                                lang={item.lang}
                                aria-pressed={effectiveMode === item.mode}
                                disabled={item.mode !== "original" && !spanishAvailable}
                                onClick={() => setMode(item.mode)}
                            >
                                {item.mode !== "original" && spanishLoading && !spanish ? `${item.label}…` : item.label}
                            </button>
                        ))}
                    </div>
                )}
                {translationNote && <p className="lecture-muted">{translationNote}</p>}
                <button type="button" className="lecture-follow" aria-pressed={following} onClick={() => setFollowing(!following)}>
                    Follow along
                </button>
            </div>
            {paragraphs.length > 0 ? (
                <ol ref={list} className="lecture-paragraphs" onWheel={() => setFollowing(false)} onTouchMove={() => setFollowing(false)}>
                    {paragraphs.map((paragraph, index) => (
                        <ParagraphRow
                            key={paragraph.key}
                            paragraph={paragraph}
                            mode={effectiveMode}
                            sourceLanguage={sourceLanguage}
                            showSpeaker={showSpeaker}
                            currentPhrase={index === currentParagraph ? (paragraph.phrases[currentPhrase]?.index ?? null) : null}
                            onSeek={onSeek}
                        />
                    ))}
                </ol>
            ) : (
                <p className="lecture-muted">The transcript is empty. No speech was detected in the recording.</p>
            )}
        </div>
    );
}
