import { ApiError } from "../../api/auth/client";
import { useAuth } from "../../api/auth/provider";
import type { Lecture } from "../../api/lectures/types";
import { createResourcesApi } from "../../api/resources/client";
import { createStudyGuidesApi, studyGuideQueryKey, type StudyGuideSource } from "../../api/study-guides/client";
import { useTranslation } from "../../i18n/use-translation";
import type { InterfaceLanguage } from "../../pages/settings/language-preferences";
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

interface StudyGuideMessages {
    ariaLabel: string;
    title: string;
    description: string;

    generateTitle: string;
    generateDescription: string;
    scope: string;
    entireCourse: string;
    lectureFallback: string;

    generating: string;
    generateGuide: string;
    generationFailed: string;

    popupBlocked: string;
    openPdfFailed: string;

    availableGuides: string;
    guideCount: (count: number) => string;

    loadingGuides: string;
    guidesUnavailable: string;
    retry: string;

    noGuidesYet: string;
    guidesAppearHere: string;

    sectionCount: (count: number) => string;

    selectGuide: string;
    selectGuideDescription: string;

    loadingGuide: string;
    guideUnavailable: string;

    overview: string;
    keyPoints: string;

    sources: string;
    page: (page: number) => string;
    opening: string;
}

const messagesByLanguage: Record<InterfaceLanguage, StudyGuideMessages> = {
    en: {
        ariaLabel: "Study guides",
        title: "Study Guides",
        description: "Create and review study guides from lecture transcripts and course resources.",

        generateTitle: "Generate a study guide",
        generateDescription: "Create a guide for the entire course or choose one lecture to focus on.",
        scope: "Study guide scope",
        entireCourse: "Entire course",
        lectureFallback: "Lecture",

        generating: "Generating…",
        generateGuide: "Generate guide",
        generationFailed: "Could not generate the study guide.",

        popupBlocked: "Allow popups and try opening the PDF again.",
        openPdfFailed: "Could not open this PDF.",

        availableGuides: "Available guides",
        guideCount: (count) => (count === 1 ? "1 guide" : `${count} guides`),

        loadingGuides: "Loading study guides…",
        guidesUnavailable: "Study guides are unavailable right now.",
        retry: "Retry",

        noGuidesYet: "No study guides yet",
        guidesAppearHere: "Generated guides will appear here.",

        sectionCount: (count) => (count === 1 ? "1 section" : `${count} sections`),

        selectGuide: "Select a study guide",
        selectGuideDescription: "Choose a guide from the list to read the overview, key points, and source material.",

        loadingGuide: "Loading study guide…",
        guideUnavailable: "Could not load this study guide.",

        overview: "Overview",
        keyPoints: "Key points",

        sources: "Sources",
        page: (page) => `Page ${page}`,
        opening: "Opening…",
    },

    es: {
        ariaLabel: "Guías de estudio",
        title: "Guías de estudio",
        description: "Crea y revisa guías de estudio a partir de transcripciones de clases y recursos del curso.",

        generateTitle: "Generar una guía de estudio",
        generateDescription: "Crea una guía para todo el curso o elige una clase específica.",
        scope: "Alcance de la guía de estudio",
        entireCourse: "Curso completo",
        lectureFallback: "Clase",

        generating: "Generando…",
        generateGuide: "Generar guía",
        generationFailed: "No se pudo generar la guía de estudio.",

        popupBlocked: "Permite las ventanas emergentes e intenta abrir el PDF nuevamente.",
        openPdfFailed: "No se pudo abrir este PDF.",

        availableGuides: "Guías disponibles",
        guideCount: (count) => (count === 1 ? "1 guía" : `${count} guías`),

        loadingGuides: "Cargando guías de estudio…",
        guidesUnavailable: "Las guías de estudio no están disponibles en este momento.",
        retry: "Reintentar",

        noGuidesYet: "Aún no hay guías de estudio",
        guidesAppearHere: "Las guías generadas aparecerán aquí.",

        sectionCount: (count) => (count === 1 ? "1 sección" : `${count} secciones`),

        selectGuide: "Selecciona una guía de estudio",
        selectGuideDescription: "Elige una guía de la lista para leer el resumen, los puntos clave y el material de origen.",

        loadingGuide: "Cargando guía de estudio…",
        guideUnavailable: "No se pudo cargar esta guía de estudio.",

        overview: "Resumen",
        keyPoints: "Puntos clave",

        sources: "Fuentes",
        page: (page) => `Página ${page}`,
        opening: "Abriendo…",
    },

    ar: {
        ariaLabel: "أدلة الدراسة",
        title: "أدلة الدراسة",
        description: "أنشئ وراجع أدلة الدراسة من نصوص المحاضرات ومصادر المقرر.",

        generateTitle: "إنشاء دليل دراسة",
        generateDescription: "أنشئ دليلاً للمقرر بالكامل أو اختر محاضرة محددة للتركيز عليها.",
        scope: "نطاق دليل الدراسة",
        entireCourse: "المقرر بالكامل",
        lectureFallback: "محاضرة",

        generating: "جارٍ الإنشاء…",
        generateGuide: "إنشاء الدليل",
        generationFailed: "تعذر إنشاء دليل الدراسة.",

        popupBlocked: "اسمح بالنوافذ المنبثقة ثم حاول فتح ملف PDF مرة أخرى.",
        openPdfFailed: "تعذر فتح ملف PDF.",

        availableGuides: "الأدلة المتاحة",
        guideCount: (count) => `${count} دليل`,

        loadingGuides: "جارٍ تحميل أدلة الدراسة…",
        guidesUnavailable: "أدلة الدراسة غير متاحة حالياً.",
        retry: "إعادة المحاولة",

        noGuidesYet: "لا توجد أدلة دراسة بعد",
        guidesAppearHere: "ستظهر الأدلة التي تم إنشاؤها هنا.",

        sectionCount: (count) => `${count} قسم`,

        selectGuide: "اختر دليل دراسة",
        selectGuideDescription: "اختر دليلاً من القائمة لقراءة الملخص والنقاط الرئيسية والمصادر.",

        loadingGuide: "جارٍ تحميل دليل الدراسة…",
        guideUnavailable: "تعذر تحميل دليل الدراسة هذا.",

        overview: "نظرة عامة",
        keyPoints: "النقاط الرئيسية",

        sources: "المصادر",
        page: (page) => `الصفحة ${page}`,
        opening: "جارٍ الفتح…",
    },

    de: {
        ariaLabel: "Lernhilfen",
        title: "Lernhilfen",
        description: "Erstelle und überprüfe Lernhilfen aus Vorlesungstranskripten und Kursmaterialien.",

        generateTitle: "Lernhilfe erstellen",
        generateDescription: "Erstelle eine Lernhilfe für den gesamten Kurs oder wähle eine bestimmte Vorlesung aus.",
        scope: "Umfang der Lernhilfe",
        entireCourse: "Gesamter Kurs",
        lectureFallback: "Vorlesung",

        generating: "Wird erstellt…",
        generateGuide: "Lernhilfe erstellen",
        generationFailed: "Die Lernhilfe konnte nicht erstellt werden.",

        popupBlocked: "Erlaube Pop-ups und versuche erneut, die PDF-Datei zu öffnen.",
        openPdfFailed: "Diese PDF-Datei konnte nicht geöffnet werden.",

        availableGuides: "Verfügbare Lernhilfen",
        guideCount: (count) => (count === 1 ? "1 Lernhilfe" : `${count} Lernhilfen`),

        loadingGuides: "Lernhilfen werden geladen…",
        guidesUnavailable: "Lernhilfen sind derzeit nicht verfügbar.",
        retry: "Erneut versuchen",

        noGuidesYet: "Noch keine Lernhilfen",
        guidesAppearHere: "Erstellte Lernhilfen werden hier angezeigt.",

        sectionCount: (count) => (count === 1 ? "1 Abschnitt" : `${count} Abschnitte`),

        selectGuide: "Lernhilfe auswählen",
        selectGuideDescription: "Wähle eine Lernhilfe aus der Liste, um Übersicht, Kernpunkte und Quellen zu lesen.",

        loadingGuide: "Lernhilfe wird geladen…",
        guideUnavailable: "Diese Lernhilfe konnte nicht geladen werden.",

        overview: "Übersicht",
        keyPoints: "Kernpunkte",

        sources: "Quellen",
        page: (page) => `Seite ${page}`,
        opening: "Wird geöffnet…",
    },

    fr: {
        ariaLabel: "Guides d’étude",
        title: "Guides d’étude",
        description: "Créez et consultez des guides d’étude à partir des transcriptions de cours et des ressources du cours.",

        generateTitle: "Générer un guide d’étude",
        generateDescription: "Créez un guide pour l’ensemble du cours ou choisissez un cours particulier.",
        scope: "Portée du guide d’étude",
        entireCourse: "Cours entier",
        lectureFallback: "Cours",

        generating: "Génération…",
        generateGuide: "Générer le guide",
        generationFailed: "Impossible de générer le guide d’étude.",

        popupBlocked: "Autorisez les fenêtres contextuelles puis essayez d’ouvrir le PDF à nouveau.",
        openPdfFailed: "Impossible d’ouvrir ce PDF.",

        availableGuides: "Guides disponibles",
        guideCount: (count) => (count === 1 ? "1 guide" : `${count} guides`),

        loadingGuides: "Chargement des guides d’étude…",
        guidesUnavailable: "Les guides d’étude sont actuellement indisponibles.",
        retry: "Réessayer",

        noGuidesYet: "Aucun guide d’étude pour le moment",
        guidesAppearHere: "Les guides générés apparaîtront ici.",

        sectionCount: (count) => (count === 1 ? "1 section" : `${count} sections`),

        selectGuide: "Sélectionner un guide d’étude",
        selectGuideDescription: "Choisissez un guide dans la liste pour consulter le résumé, les points clés et les sources.",

        loadingGuide: "Chargement du guide d’étude…",
        guideUnavailable: "Impossible de charger ce guide d’étude.",

        overview: "Aperçu",
        keyPoints: "Points clés",

        sources: "Sources",
        page: (page) => `Page ${page}`,
        opening: "Ouverture…",
    },
};

const localeByLanguage: Record<InterfaceLanguage, string> = {
    en: "en-US",
    es: "es-ES",
    ar: "ar",
    de: "de-DE",
    fr: "fr-FR",
};

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
    const { language } = useTranslation();

    const messages = messagesByLanguage[language];

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
        queryKey: [...listQueryKey, "guide", selectedGuideId ?? "none"],

        queryFn: ({ signal }) => api.get(courseId, selectedGuideId!, signal),

        enabled: selectedGuideId !== undefined,

        retry: false,
    });

    useEffect(() => {
        const firstGuide = guides.data?.[0];

        if (selectedGuideId === undefined && firstGuide) {
            setSelectedGuideId(firstGuide.id);
        }
    }, [guides.data, selectedGuideId]);

    function guideScope(guideLectureId?: string) {
        if (!guideLectureId) {
            return messages.entireCourse;
        }

        return lectures.find((lecture) => lecture.id === guideLectureId)?.title ?? messages.lectureFallback;
    }

    async function generateGuide() {
        if (!canManage || generating) {
            return;
        }

        const signal = lifetime.current?.signal;

        setGenerating(true);
        setError("");

        try {
            const guide = await api.generate(courseId, lectureId || undefined, language, signal);

            await queryClient.invalidateQueries({
                queryKey: listQueryKey,
            });

            setSelectedGuideId(guide.id);
        } catch (error_) {
            if (!signal?.aborted) {
                setError(
                    language === "en" && (error_ instanceof ApiError || error_ instanceof Error)
                        ? error_.message
                        : messages.generationFailed,
                );
            }
        } finally {
            if (!signal?.aborted) {
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

                if (source.pageNumber === undefined) {
                    return url;
                }

                return `${url}#page=${source.pageNumber}`;
            }, signal);

            if (outcome === "blocked") {
                setError(messages.popupBlocked);
            }
        } catch (error_) {
            if (!signal.aborted) {
                setError(language === "en" && error_ instanceof Error ? error_.message : messages.openPdfFailed);
            }
        } finally {
            if (!signal.aborted) {
                setOpeningResource(null);
            }
        }
    }

    return (
        <section className="study-guides-container" aria-label={messages.ariaLabel}>
            <header className="study-guides-header">
                <h2>{messages.title}</h2>

                <p>{messages.description}</p>
            </header>

            {canManage && (
                <section className="study-guides-generate">
                    <div className="study-guides-generate-info">
                        <h3>{messages.generateTitle}</h3>

                        <p>{messages.generateDescription}</p>
                    </div>

                    <div className="study-guides-generate-actions">
                        <label htmlFor="study-guide-scope">
                            <span>{messages.scope}</span>

                            <select
                                id="study-guide-scope"
                                value={lectureId}
                                disabled={generating}
                                onChange={(event) => setLectureId(event.target.value)}
                            >
                                <option value="">{messages.entireCourse}</option>

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
                            {generating ? messages.generating : messages.generateGuide}
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
                        <h3>{messages.availableGuides}</h3>

                        {guides.data && <span>{messages.guideCount(guides.data.length)}</span>}
                    </div>

                    {guides.isPending && (
                        <p className="study-guides-status" role="status">
                            {messages.loadingGuides}
                        </p>
                    )}

                    {guides.isError && (
                        <div className="study-guides-load-error" role="alert">
                            <p>
                                {language === "en" && guides.error instanceof ApiError ? guides.error.message : messages.guidesUnavailable}
                            </p>

                            <button type="button" className="lecture-text-button" onClick={() => void guides.refetch()}>
                                {messages.retry}
                            </button>
                        </div>
                    )}

                    {guides.isSuccess && guides.data.length === 0 && (
                        <div className="study-guides-empty">
                            <h4>{messages.noGuidesYet}</h4>

                            <p>{messages.guidesAppearHere}</p>
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
                                                <span>{messages.sectionCount(guide.sectionCount)}</span>

                                                <span>{new Date(guide.createdAt).toLocaleDateString(localeByLanguage[language])}</span>
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
                            <h3>{messages.selectGuide}</h3>

                            <p>{messages.selectGuideDescription}</p>
                        </div>
                    )}

                    {selectedGuideId && selectedGuide.isPending && (
                        <p className="study-guides-status" role="status">
                            {messages.loadingGuide}
                        </p>
                    )}

                    {selectedGuide.isError && (
                        <div className="study-guides-load-error" role="alert">
                            <p>
                                {language === "en" && selectedGuide.error instanceof ApiError
                                    ? selectedGuide.error.message
                                    : messages.guideUnavailable}
                            </p>

                            <button type="button" className="lecture-text-button" onClick={() => void selectedGuide.refetch()}>
                                {messages.retry}
                            </button>
                        </div>
                    )}

                    {selectedGuide.data && (
                        <article className="study-guide-document">
                            <header className="study-guide-document-header">
                                <span className="study-guide-document-scope">{guideScope(selectedGuide.data.lectureId)}</span>

                                <h3>{selectedGuide.data.title}</h3>

                                <span className="study-guide-document-meta">{messages.sectionCount(selectedGuide.data.sectionCount)}</span>
                            </header>

                            <section className="study-guide-overview">
                                <h4>{messages.overview}</h4>

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
                                                <h5>{messages.keyPoints}</h5>

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
    const { language } = useTranslation();

    const messages = messagesByLanguage[language];

    if (sources.length === 0) {
        return null;
    }

    return (
        <div className="study-guide-sources">
            <span className="study-guide-sources-label">{messages.sources}</span>

            <div className="study-guide-source-list">
                {sources.map((source, index) => {
                    const location =
                        source.pageNumber === undefined
                            ? source.startSeconds === undefined
                                ? undefined
                                : formatTimestamp(source.startSeconds)
                            : messages.page(source.pageNumber);

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
                                {openingResource === source.resourceId ? messages.opening : label}
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
