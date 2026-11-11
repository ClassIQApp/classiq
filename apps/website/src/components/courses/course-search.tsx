import { ApiError } from "../../api/auth/client";
import { useAuth } from "../../api/auth/provider";
import type { Lecture } from "../../api/lectures/types";
import { createResourcesApi } from "../../api/resources/client";
import { createSearchApi, searchQueryKey } from "../../api/search/client";
import type { ContentKind, SearchApi, SearchFilters, SearchPassage } from "../../api/search/client";
import { useTranslation } from "../../i18n/use-translation";
import type { InterfaceLanguage } from "../../pages/settings/language-preferences";
import { formatTimestamp } from "../lectures/timestamp";
import { openInNewTab } from "./open-in-new-tab";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

const SEARCH_DEBOUNCE_MS = 300;
const MAX_QUERY_LENGTH = 500;

interface SearchMessages {
    ariaLabel: string;
    title: string;
    description: string;

    search: string;
    placeholder: string;

    content: string;
    allContent: string;

    lecture: string;
    allLectures: string;

    resourceSingular: string;
    resourcePlural: string;

    transcriptSingular: string;
    transcriptPlural: string;

    enterSearch: string;
    searching: string;
    searchUnavailable: string;
    retry: string;

    noResults: (text: string) => string;
    resultCount: (count: number) => string;

    page: (page: number) => string;

    opening: string;
    openPdf: string;
    openPdfAt: (location: string) => string;

    openLecture: string;
    openLectureAt: (location: string) => string;

    popupBlocked: string;
    openPdfFailed: string;
}

const messagesByLanguage: Record<InterfaceLanguage, SearchMessages> = {
    en: {
        ariaLabel: "Course search",
        title: "Search this course",
        description: "Find passages in lecture transcripts and PDF resources shared with this course.",

        search: "Search",
        placeholder: "e.g. activation energy",

        content: "Content",
        allContent: "All content",

        lecture: "Lecture",
        allLectures: "All lectures",

        resourceSingular: "PDF resource",
        resourcePlural: "PDF resources",

        transcriptSingular: "Lecture transcript",
        transcriptPlural: "Lecture transcripts",

        enterSearch: "Enter a word or phrase to search across this course.",
        searching: "Searching…",
        searchUnavailable: "Search is unavailable right now.",
        retry: "Retry",

        noResults: (text) => `No results for “${text}”. Try different words or clear the filters.`,

        resultCount: (count) => (count === 1 ? "1 result" : `${count} results`),

        page: (page) => `Page ${page}`,

        opening: "Opening…",
        openPdf: "Open PDF",
        openPdfAt: (location) => `Open PDF at ${location}`,

        openLecture: "Open lecture",
        openLectureAt: (location) => `Open lecture at ${location}`,

        popupBlocked: "Allow popups and try opening the PDF again.",

        openPdfFailed: "Could not open this PDF. Try again for a fresh link.",
    },

    es: {
        ariaLabel: "Búsqueda del curso",
        title: "Buscar en este curso",
        description: "Busca contenido en las transcripciones de las clases y los recursos PDF compartidos con este curso.",

        search: "Buscar",
        placeholder: "p. ej. energía de activación",

        content: "Contenido",
        allContent: "Todo el contenido",

        lecture: "Clase",
        allLectures: "Todas las clases",

        resourceSingular: "Recurso PDF",
        resourcePlural: "Recursos PDF",

        transcriptSingular: "Transcripción de clase",
        transcriptPlural: "Transcripciones de clases",

        enterSearch: "Ingresa una palabra o frase para buscar en este curso.",

        searching: "Buscando…",

        searchUnavailable: "La búsqueda no está disponible en este momento.",

        retry: "Reintentar",

        noResults: (text) => `No hay resultados para “${text}”. Prueba otras palabras o elimina los filtros.`,

        resultCount: (count) => (count === 1 ? "1 resultado" : `${count} resultados`),

        page: (page) => `Página ${page}`,

        opening: "Abriendo…",

        openPdf: "Abrir PDF",

        openPdfAt: (location) => `Abrir PDF en ${location}`,

        openLecture: "Abrir clase",

        openLectureAt: (location) => `Abrir clase en ${location}`,

        popupBlocked: "Permite las ventanas emergentes e intenta abrir el PDF nuevamente.",

        openPdfFailed: "No se pudo abrir este PDF. Inténtalo de nuevo.",
    },

    ar: {
        ariaLabel: "البحث في المقرر",
        title: "البحث في هذا المقرر",
        description: "ابحث في نصوص المحاضرات وملفات PDF المشتركة مع هذا المقرر.",

        search: "بحث",
        placeholder: "مثال: طاقة التنشيط",

        content: "المحتوى",
        allContent: "كل المحتوى",

        lecture: "المحاضرة",
        allLectures: "كل المحاضرات",

        resourceSingular: "مصدر PDF",
        resourcePlural: "مصادر PDF",

        transcriptSingular: "نص المحاضرة",
        transcriptPlural: "نصوص المحاضرات",

        enterSearch: "أدخل كلمة أو عبارة للبحث في هذا المقرر.",

        searching: "جارٍ البحث…",

        searchUnavailable: "البحث غير متاح حالياً.",

        retry: "إعادة المحاولة",

        noResults: (text) => `لا توجد نتائج لـ “${text}”. جرّب كلمات مختلفة أو أزل عوامل التصفية.`,

        resultCount: (count) => `${count} نتيجة`,

        page: (page) => `الصفحة ${page}`,

        opening: "جارٍ الفتح…",

        openPdf: "فتح PDF",

        openPdfAt: (location) => `فتح PDF عند ${location}`,

        openLecture: "فتح المحاضرة",

        openLectureAt: (location) => `فتح المحاضرة عند ${location}`,

        popupBlocked: "اسمح بالنوافذ المنبثقة ثم حاول فتح ملف PDF مرة أخرى.",

        openPdfFailed: "تعذر فتح ملف PDF. حاول مرة أخرى.",
    },

    de: {
        ariaLabel: "Kurssuche",
        title: "Diesen Kurs durchsuchen",
        description: "Suche in Vorlesungstranskripten und PDF-Materialien, die mit diesem Kurs geteilt wurden.",

        search: "Suchen",
        placeholder: "z. B. Aktivierungsenergie",

        content: "Inhalt",
        allContent: "Alle Inhalte",

        lecture: "Vorlesung",
        allLectures: "Alle Vorlesungen",

        resourceSingular: "PDF-Material",
        resourcePlural: "PDF-Materialien",

        transcriptSingular: "Vorlesungstranskript",
        transcriptPlural: "Vorlesungstranskripte",

        enterSearch: "Gib ein Wort oder einen Ausdruck ein, um diesen Kurs zu durchsuchen.",

        searching: "Suche läuft…",

        searchUnavailable: "Die Suche ist derzeit nicht verfügbar.",

        retry: "Erneut versuchen",

        noResults: (text) => `Keine Ergebnisse für „${text}“. Versuche andere Wörter oder entferne die Filter.`,

        resultCount: (count) => (count === 1 ? "1 Ergebnis" : `${count} Ergebnisse`),

        page: (page) => `Seite ${page}`,

        opening: "Wird geöffnet…",

        openPdf: "PDF öffnen",

        openPdfAt: (location) => `PDF bei ${location} öffnen`,

        openLecture: "Vorlesung öffnen",

        openLectureAt: (location) => `Vorlesung bei ${location} öffnen`,

        popupBlocked: "Erlaube Pop-ups und versuche erneut, die PDF-Datei zu öffnen.",

        openPdfFailed: "Diese PDF-Datei konnte nicht geöffnet werden. Versuche es erneut.",
    },

    fr: {
        ariaLabel: "Recherche dans le cours",
        title: "Rechercher dans ce cours",
        description: "Recherchez des passages dans les transcriptions des cours et les ressources PDF partagées avec ce cours.",

        search: "Recherche",
        placeholder: "ex. énergie d’activation",

        content: "Contenu",
        allContent: "Tout le contenu",

        lecture: "Cours",
        allLectures: "Tous les cours",

        resourceSingular: "Ressource PDF",
        resourcePlural: "Ressources PDF",

        transcriptSingular: "Transcription de cours",
        transcriptPlural: "Transcriptions de cours",

        enterSearch: "Entrez un mot ou une phrase pour effectuer une recherche dans ce cours.",

        searching: "Recherche…",

        searchUnavailable: "La recherche est actuellement indisponible.",

        retry: "Réessayer",

        noResults: (text) => `Aucun résultat pour « ${text} ». Essayez d’autres mots ou supprimez les filtres.`,

        resultCount: (count) => (count === 1 ? "1 résultat" : `${count} résultats`),

        page: (page) => `Page ${page}`,

        opening: "Ouverture…",

        openPdf: "Ouvrir le PDF",

        openPdfAt: (location) => `Ouvrir le PDF à ${location}`,

        openLecture: "Ouvrir le cours",

        openLectureAt: (location) => `Ouvrir le cours à ${location}`,

        popupBlocked: "Autorisez les fenêtres contextuelles puis essayez d’ouvrir le PDF à nouveau.",

        openPdfFailed: "Impossible d’ouvrir ce PDF. Réessayez.",
    },
};

type ResourcesApi = ReturnType<typeof createResourcesApi>;

interface CourseSearchProps {
    courseId: string;
    lectures: Lecture[];
    onOpenLecture: (lectureId: string, startSeconds?: number) => void;
}

interface SearchPanelProps extends CourseSearchProps {
    accountId: string;
    api: SearchApi;
    resources: ResourcesApi;
}

interface SearchResultsProps {
    accountId: string;
    courseId: string;
    filters: SearchFilters;
    lectures: Lecture[];
    api: SearchApi;
    opening: string | null;

    onOpenResource: (passage: SearchPassage) => void;

    onOpenLecture: (passage: SearchPassage) => void;
}

interface SearchResultProps {
    passage: SearchPassage;
    lectures: Lecture[];
    opening: string | null;

    onOpenResource: (passage: SearchPassage) => void;

    onOpenLecture: (passage: SearchPassage) => void;
}

export function passageLocation(passage: SearchPassage, language: InterfaceLanguage = "en") {
    const messages = messagesByLanguage[language];

    if (passage.pageNumber !== undefined) {
        return messages.page(passage.pageNumber);
    }

    if (passage.startSeconds !== undefined) {
        return formatTimestamp(passage.startSeconds);
    }

    return undefined;
}

function useDebouncedValue<T>(value: T, delay: number) {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timeout = setTimeout(() => setDebounced(value), delay);

        return () => clearTimeout(timeout);
    }, [value, delay]);

    return debounced;
}

export default function CourseSearch(props: CourseSearchProps) {
    const { state, apiFetch } = useAuth();

    const api = useMemo(() => createSearchApi(apiFetch), [apiFetch]);

    const resources = useMemo(() => createResourcesApi(apiFetch), [apiFetch]);

    if (state.status !== "authenticated") {
        return null;
    }

    return <SearchPanel key={`${state.user.id}:${props.courseId}`} {...props} accountId={state.user.id} api={api} resources={resources} />;
}

export function SearchPanel({ courseId, lectures, onOpenLecture, accountId, api, resources }: SearchPanelProps) {
    const { language } = useTranslation();

    const messages = messagesByLanguage[language];

    const [text, setText] = useState("");

    const [kind, setKind] = useState<ContentKind | "all">("all");

    const [lectureId, setLectureId] = useState("");

    const [opening, setOpening] = useState<string | null>(null);

    const [error, setError] = useState("");

    const lifetime = useRef<AbortController | null>(null);

    const debouncedText = useDebouncedValue(text.trim(), SEARCH_DEBOUNCE_MS);

    const filters: SearchFilters = {
        text: debouncedText,

        kind: kind === "all" ? undefined : kind,

        lectureId: lectureId || undefined,
    };

    useEffect(() => {
        const controller = new AbortController();

        lifetime.current = controller;

        return () => controller.abort();
    }, []);

    async function openResource(passage: SearchPassage) {
        const signal = lifetime.current?.signal;

        const resourceId = passage.resourceId;

        if (!signal || signal.aborted || !resourceId) {
            return;
        }

        setOpening(passage.id);
        setError("");

        const resolveUrl = async () => {
            const url = await resources.download(courseId, resourceId, signal);

            if (passage.pageNumber === undefined) {
                return url;
            }

            return `${url}#page=${passage.pageNumber}`;
        };

        try {
            const outcome = await openInNewTab(resolveUrl, signal);

            if (outcome === "blocked") {
                setError(messages.popupBlocked);
            }
        } catch (error_) {
            if (!signal.aborted) {
                setError(language === "en" && error_ instanceof Error ? error_.message : messages.openPdfFailed);
            }
        } finally {
            if (!signal.aborted) {
                setOpening(null);
            }
        }
    }

    function openLecture(passage: SearchPassage) {
        if (passage.lectureId) {
            onOpenLecture(passage.lectureId, passage.startSeconds);
        }
    }

    return (
        <section className="search-container" aria-label={messages.ariaLabel}>
            <h2>{messages.title}</h2>

            <p className="search-desc">{messages.description}</p>

            <form role="search" className="search-filters" onSubmit={(event) => event.preventDefault()}>
                <label>
                    {messages.search}

                    <input
                        type="search"
                        value={text}
                        maxLength={MAX_QUERY_LENGTH}
                        placeholder={messages.placeholder}
                        onChange={(event) => setText(event.target.value)}
                    />
                </label>

                <label>
                    {messages.content}

                    <select value={kind} onChange={(event) => setKind(event.target.value as ContentKind | "all")}>
                        <option value="all">{messages.allContent}</option>

                        <option value="resource">{messages.resourcePlural}</option>

                        <option value="transcript">{messages.transcriptPlural}</option>
                    </select>
                </label>

                <label>
                    {messages.lecture}

                    <select value={lectureId} onChange={(event) => setLectureId(event.target.value)}>
                        <option value="">{messages.allLectures}</option>

                        {lectures.map((lecture) => (
                            <option key={lecture.id} value={lecture.id}>
                                {lecture.title}
                            </option>
                        ))}
                    </select>
                </label>
            </form>

            {error && <p role="alert">{error}</p>}

            <SearchResults
                accountId={accountId}
                courseId={courseId}
                filters={filters}
                lectures={lectures}
                api={api}
                opening={opening}
                onOpenResource={(passage) => void openResource(passage)}
                onOpenLecture={openLecture}
            />
        </section>
    );
}

export function SearchResults({ accountId, courseId, filters, lectures, api, opening, onOpenResource, onOpenLecture }: SearchResultsProps) {
    const { language } = useTranslation();

    const messages = messagesByLanguage[language];

    const results = useQuery({
        queryKey: searchQueryKey(accountId, courseId, filters),

        queryFn: ({ signal }) => api.search(courseId, filters, signal),

        enabled: filters.text.length > 0,

        retry: false,
    });

    if (filters.text.length === 0) {
        return <p className="search-hint">{messages.enterSearch}</p>;
    }

    if (results.isPending) {
        return <p role="status">{messages.searching}</p>;
    }

    if (results.isError) {
        const message = language === "en" && results.error instanceof ApiError ? results.error.message : messages.searchUnavailable;

        return (
            <p role="alert">
                {message}{" "}
                <button type="button" onClick={() => void results.refetch()}>
                    {messages.retry}
                </button>
            </p>
        );
    }

    if (results.data.length === 0) {
        return <p role="status">{messages.noResults(filters.text)}</p>;
    }

    return (
        <>
            <p role="status" className="search-hint">
                {messages.resultCount(results.data.length)}
            </p>

            <ol className="search-results">
                {results.data.map((passage) => (
                    <SearchResult
                        key={passage.id}
                        passage={passage}
                        lectures={lectures}
                        opening={opening}
                        onOpenResource={onOpenResource}
                        onOpenLecture={onOpenLecture}
                    />
                ))}
            </ol>
        </>
    );
}

function SearchResult({ passage, lectures, opening, onOpenResource, onOpenLecture }: SearchResultProps) {
    const { language } = useTranslation();

    const messages = messagesByLanguage[language];

    const location = passageLocation(passage, language);

    const lecture = lectures.find((item) => item.id === passage.lectureId);

    function kindLabel() {
        return passage.kind === "resource" ? messages.resourceSingular : messages.transcriptSingular;
    }

    function resourceLabel() {
        if (opening === passage.id) {
            return messages.opening;
        }

        if (location) {
            return messages.openPdfAt(location);
        }

        return messages.openPdf;
    }

    function action() {
        if (passage.kind === "resource") {
            return (
                <button type="button" className="resources-view-btn" disabled={opening !== null} onClick={() => onOpenResource(passage)}>
                    {resourceLabel()}
                </button>
            );
        }

        return (
            <button type="button" className="resources-view-btn" onClick={() => onOpenLecture(passage)}>
                {location ? messages.openLectureAt(location) : messages.openLecture}
            </button>
        );
    }

    return (
        <li className="search-result">
            <div className="search-result-heading">
                <span className="search-result-title">{passage.title}</span>

                <span className="search-result-meta">
                    {kindLabel()}

                    {location && ` · ${location}`}

                    {passage.kind === "resource" && lecture && ` · ${lecture.title}`}
                </span>
            </div>

            <p className="search-result-snippet">{passage.content}</p>

            {action()}
        </li>
    );
}
