import type { CourseRole } from "../../api/courses/types";
import { isFixtureProvider } from "../../api/lectures/content";
import type { KeyTerms, SpanishTranscript, Summary, Transcript } from "../../api/lectures/content";
import { displayError, stageStatus } from "../../api/lectures/processing";
import type { LectureProcessing, ProcessingStageName } from "../../api/lectures/processing";
import type { LectureStatus } from "../../api/lectures/types";
import { useTranslation } from "../../i18n/use-translation";
import type { InterfaceLanguage } from "../../pages/settings/language-preferences";
import { TimestampButton } from "./timestamp";
import type { UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";

export type StudyOutput = "summary" | "key_terms" | "transcript";

const stageByOutput: Record<StudyOutput, ProcessingStageName> = {
    summary: "summary",
    key_terms: "key_terms",
    transcript: "transcription",
};

const SUMMARY_CLAMP_CHARACTERS = 480;
const KEY_TERMS_PREVIEW = 8;

interface LectureMaterialMessages {
    headings: Record<StudyOutput, string>;

    loading: string;
    tryAgain: string;

    loadError: (heading: string) => string;

    failed: string;
    failedTeacher: string;
    processing: string;
    pending: string;
    uploaded: string;
    stopped: string;
    unavailable: string;

    fixtureOutput: string;
    generatedWarning: string;
    transcriptSource: string;
    generatedSource: string;

    stale: string;

    readFullSummary: string;
    showLess: string;

    showFewer: string;
    showAllTerms: (count: number) => string;
}

const messagesByLanguage: Record<InterfaceLanguage, LectureMaterialMessages> = {
    en: {
        headings: {
            summary: "Summary",
            key_terms: "Key terms",
            transcript: "Transcript",
        },

        loading: "Loading…",
        tryAgain: "Try again",

        loadError: (heading) => `Couldn’t load ${heading.toLowerCase()}.`,

        failed: "This content couldn’t be prepared.",
        failedTeacher: "Retry processing to try again.",
        processing: "This content is still being prepared and will appear here automatically.",
        pending: "This content will be prepared after the recording is uploaded.",
        uploaded: "This content will be prepared once the recording is processed.",
        stopped: "This content wasn’t prepared because processing stopped.",
        unavailable: "This content is not available for this lecture.",

        fixtureOutput: "Development fixture output",
        generatedWarning: "Generated automatically and may contain mistakes.",
        transcriptSource: "Transcript",
        generatedSource: "Summary and key terms",

        stale: "Generated from an earlier version of the transcript.",

        readFullSummary: "Read full summary",
        showLess: "Show less",

        showFewer: "Show fewer",
        showAllTerms: (count) => `Show all ${count} terms`,
    },

    es: {
        headings: {
            summary: "Resumen",
            key_terms: "Términos clave",
            transcript: "Transcripción",
        },

        loading: "Cargando…",
        tryAgain: "Intentar de nuevo",

        loadError: (heading) => `No se pudo cargar ${heading.toLowerCase()}.`,

        failed: "No se pudo preparar este contenido.",
        failedTeacher: "Vuelve a procesar la grabación para intentarlo de nuevo.",
        processing: "Este contenido todavía se está preparando y aparecerá aquí automáticamente.",
        pending: "Este contenido se preparará después de subir la grabación.",
        uploaded: "Este contenido se preparará cuando se procese la grabación.",
        stopped: "Este contenido no se preparó porque el procesamiento se detuvo.",
        unavailable: "Este contenido no está disponible para esta clase.",

        fixtureOutput: "Resultado de prueba de desarrollo",
        generatedWarning: "Generado automáticamente y puede contener errores.",
        transcriptSource: "Transcripción",
        generatedSource: "Resumen y términos clave",

        stale: "Generado a partir de una versión anterior de la transcripción.",

        readFullSummary: "Leer resumen completo",
        showLess: "Mostrar menos",

        showFewer: "Mostrar menos",
        showAllTerms: (count) => `Mostrar los ${count} términos`,
    },

    ar: {
        headings: {
            summary: "الملخص",
            key_terms: "المصطلحات الرئيسية",
            transcript: "النص",
        },

        loading: "جارٍ التحميل…",
        tryAgain: "حاول مرة أخرى",

        loadError: (heading) => `تعذر تحميل ${heading}.`,

        failed: "تعذر إعداد هذا المحتوى.",
        failedTeacher: "أعد تشغيل المعالجة للمحاولة مرة أخرى.",
        processing: "لا يزال هذا المحتوى قيد الإعداد وسيظهر هنا تلقائياً عند اكتماله.",
        pending: "سيتم إعداد هذا المحتوى بعد رفع التسجيل.",
        uploaded: "سيتم إعداد هذا المحتوى بعد معالجة التسجيل.",
        stopped: "لم يتم إعداد هذا المحتوى لأن المعالجة توقفت.",
        unavailable: "هذا المحتوى غير متاح لهذه المحاضرة.",

        fixtureOutput: "مخرجات اختبار التطوير",
        generatedWarning: "تم إنشاؤه تلقائياً وقد يحتوي على أخطاء.",
        transcriptSource: "النص",
        generatedSource: "الملخص والمصطلحات الرئيسية",

        stale: "تم إنشاؤه من إصدار أقدم من النص.",

        readFullSummary: "قراءة الملخص كاملاً",
        showLess: "عرض أقل",

        showFewer: "عرض عدد أقل",
        showAllTerms: (count) => `عرض جميع المصطلحات (${count})`,
    },

    de: {
        headings: {
            summary: "Zusammenfassung",
            key_terms: "Schlüsselbegriffe",
            transcript: "Transkript",
        },

        loading: "Wird geladen…",
        tryAgain: "Erneut versuchen",

        loadError: (heading) => `${heading} konnte nicht geladen werden.`,

        failed: "Dieser Inhalt konnte nicht erstellt werden.",
        failedTeacher: "Starte die Verarbeitung erneut, um es noch einmal zu versuchen.",
        processing: "Dieser Inhalt wird noch erstellt und erscheint hier automatisch.",
        pending: "Dieser Inhalt wird erstellt, nachdem die Aufnahme hochgeladen wurde.",
        uploaded: "Dieser Inhalt wird erstellt, sobald die Aufnahme verarbeitet wird.",
        stopped: "Dieser Inhalt wurde nicht erstellt, weil die Verarbeitung gestoppt wurde.",
        unavailable: "Dieser Inhalt ist für diese Vorlesung nicht verfügbar.",

        fixtureOutput: "Entwicklungs-Testausgabe",
        generatedWarning: "Automatisch erstellt und möglicherweise fehlerhaft.",
        transcriptSource: "Transkript",
        generatedSource: "Zusammenfassung und Schlüsselbegriffe",

        stale: "Aus einer älteren Version des Transkripts erstellt.",

        readFullSummary: "Vollständige Zusammenfassung lesen",
        showLess: "Weniger anzeigen",

        showFewer: "Weniger anzeigen",
        showAllTerms: (count) => `Alle ${count} Begriffe anzeigen`,
    },

    fr: {
        headings: {
            summary: "Résumé",
            key_terms: "Termes clés",
            transcript: "Transcription",
        },

        loading: "Chargement…",
        tryAgain: "Réessayer",

        loadError: (heading) => `Impossible de charger : ${heading}.`,

        failed: "Impossible de préparer ce contenu.",
        failedTeacher: "Relancez le traitement pour réessayer.",
        processing: "Ce contenu est encore en cours de préparation et apparaîtra ici automatiquement.",
        pending: "Ce contenu sera préparé après le téléchargement de l’enregistrement.",
        uploaded: "Ce contenu sera préparé lorsque l’enregistrement sera traité.",
        stopped: "Ce contenu n’a pas été préparé car le traitement s’est arrêté.",
        unavailable: "Ce contenu n’est pas disponible pour ce cours.",

        fixtureOutput: "Résultat de test de développement",
        generatedWarning: "Généré automatiquement et peut contenir des erreurs.",
        transcriptSource: "Transcription",
        generatedSource: "Résumé et termes clés",

        stale: "Généré à partir d’une ancienne version de la transcription.",

        readFullSummary: "Lire le résumé complet",
        showLess: "Afficher moins",

        showFewer: "Afficher moins",
        showAllTerms: (count) => `Afficher les ${count} termes`,
    },
};

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

function unavailableMessage(output: StudyOutput, { processing, fallbackStatus, role }: MaterialContext, messages: LectureMaterialMessages) {
    const stage = stageByOutput[output];

    const status = processing?.status ?? fallbackStatus;

    const stageState = stageStatus(processing, stage);

    if (stageState === "failed" && status !== "processing") {
        return role === "teacher" ? `${messages.failed} ${messages.failedTeacher}` : messages.failed;
    }

    if (status === "processing") {
        return messages.processing;
    }

    if (status === "pending") {
        return messages.pending;
    }

    if (status === "uploaded") {
        return messages.uploaded;
    }

    if (status === "failed") {
        return messages.stopped;
    }

    return messages.unavailable;
}

export function OutputPlaceholder({ output, query, ...context }: OutputPlaceholderProps) {
    const { language } = useTranslation();

    const messages = messagesByLanguage[language];

    if (query.isPending) {
        return <p className="lecture-muted">{messages.loading}</p>;
    }

    if (query.isError) {
        return (
            <div className="lecture-panel-message">
                <p>
                    {messages.loadError(messages.headings[output])} {displayError(query.error)}
                </p>

                <button type="button" className="lecture-text-button" disabled={query.isFetching} onClick={() => void query.refetch()}>
                    {query.isFetching ? messages.loading : messages.tryAgain}
                </button>
            </div>
        );
    }

    return <p className="lecture-panel-message">{unavailableMessage(output, context, messages)}</p>;
}

interface ProvenanceProps {
    content: StudyContent;
}

export function Provenance({ content }: ProvenanceProps) {
    const { language } = useTranslation();

    const messages = messagesByLanguage[language];

    const transcript = content.transcript.data;

    const generated = content.summary.data ?? content.keyTerms.data;

    const fixture = [transcript?.provider, content.summary.data?.provider, content.keyTerms.data?.provider].some(
        (provider) => provider && isFixtureProvider(provider),
    );

    const sources = [
        transcript && `${messages.transcriptSource}: ${transcript.provider} (${transcript.model})`,

        generated && `${messages.generatedSource}: ${generated.provider} (${generated.model})`,
    ].filter(Boolean);

    if (sources.length === 0) {
        return null;
    }

    return (
        <p className="lecture-provenance">
            {fixture && <span className="lecture-fixture-badge">{messages.fixtureOutput}</span>}
            {messages.generatedWarning} {sources.join(" · ")}
        </p>
    );
}

function StaleNote() {
    const { language } = useTranslation();

    const messages = messagesByLanguage[language];

    return <p className="lecture-stale-note">{messages.stale}</p>;
}

export function SummarySection({ content, ...context }: SummarySectionProps) {
    const { language } = useTranslation();

    const messages = messagesByLanguage[language];

    const [expanded, setExpanded] = useState(false);

    const summary = content.summary.data;

    const sourceHash = content.transcript.data?.contentHash;

    const long = (summary?.content.text.length ?? 0) > SUMMARY_CLAMP_CHARACTERS;

    return (
        <section className="lecture-card lecture-summary-card" aria-labelledby="lecture-summary-heading">
            <h2 id="lecture-summary-heading">{messages.headings.summary}</h2>

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
                            {expanded ? messages.showLess : messages.readFullSummary}
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
    const { language } = useTranslation();

    const messages = messagesByLanguage[language];

    const [showAll, setShowAll] = useState(false);

    const keyTerms = content.keyTerms.data;

    const sourceHash = content.transcript.data?.contentHash;

    const terms = keyTerms?.content.terms ?? [];

    const visible = showAll ? terms : terms.slice(0, KEY_TERMS_PREVIEW);

    return (
        <section className="lecture-card lecture-terms-card" aria-labelledby="lecture-terms-heading">
            <h2 id="lecture-terms-heading">
                {messages.headings.key_terms}

                {terms.length > 0 && <span className="lecture-count">{terms.length}</span>}
            </h2>

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
                            {showAll ? messages.showFewer : messages.showAllTerms(terms.length)}
                        </button>
                    )}
                </>
            ) : (
                <OutputPlaceholder output="key_terms" query={content.keyTerms} {...context} />
            )}
        </section>
    );
}
