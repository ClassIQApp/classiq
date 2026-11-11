import type { Course } from "../../api/courses/types";
import type { LectureStatus as Status } from "../../api/lectures/types";
import { useTranslation } from "../../i18n/use-translation";
import type { InterfaceLanguage } from "../../pages/settings/language-preferences";
import LectureStatus, { availabilitySummary } from "./lecture-status";
import LectureUploadForm from "./lecture-upload-form";
import { ArrowLeftIcon, ArrowRightIcon, BookOpenIcon } from "@phosphor-icons/react";

export type LectureSort = "newest" | "oldest" | "title";

const statuses: Status[] = ["ready", "processing", "uploaded", "failed", "pending"];

interface LectureListMessages {
    course: string;
    noCoursesAvailable: string;

    findLecture: string;
    searchLectures: string;

    processingState: string;
    allStates: string;

    statusLabels: Record<Status, string>;

    sortBy: string;
    newestAdded: string;
    oldestAdded: string;
    titleAZ: string;

    lectures: string;

    lectureCount: (visible: number, total: number) => string;

    noCoursesYet: string;
    noCoursesDescription: string;

    noLecturesYet: string;
    teacherNoLecturesDescription: string;
    memberNoLecturesDescription: string;

    noMatchingLectures: string;
    noMatchingDescription: string;

    viewLecture: string;
    clearFilters: string;
}

const messagesByLanguage: Record<InterfaceLanguage, LectureListMessages> = {
    en: {
        course: "Course",
        noCoursesAvailable: "No courses available",

        findLecture: "Find a lecture",
        searchLectures: "Search lectures…",

        processingState: "Processing state",
        allStates: "All states",

        statusLabels: {
            ready: "Ready",
            processing: "Processing",
            uploaded: "Uploaded",
            failed: "Failed",
            pending: "Pending",
        },

        sortBy: "Sort by",
        newestAdded: "Newest added",
        oldestAdded: "Oldest added",
        titleAZ: "Title A–Z",

        lectures: "Lectures",

        lectureCount: (visible, total) => `${visible} of ${total} ${total === 1 ? "lecture" : "lectures"}`,

        noCoursesYet: "No courses yet",
        noCoursesDescription: "Your courses and lectures will appear here when available.",

        noLecturesYet: "No lectures yet",
        teacherNoLecturesDescription: "Upload your first lecture recording to get started.",
        memberNoLecturesDescription: "Lectures will appear here when your instructor adds them.",

        noMatchingLectures: "No matching lectures",
        noMatchingDescription: "Try a different search or processing state.",

        viewLecture: "View lecture",
        clearFilters: "Clear filters",
    },

    es: {
        course: "Curso",
        noCoursesAvailable: "No hay cursos disponibles",

        findLecture: "Buscar una clase",
        searchLectures: "Buscar clases…",

        processingState: "Estado de procesamiento",
        allStates: "Todos los estados",

        statusLabels: {
            ready: "Listo",
            processing: "Procesando",
            uploaded: "Subido",
            failed: "Fallido",
            pending: "Pendiente",
        },

        sortBy: "Ordenar por",
        newestAdded: "Más recientes",
        oldestAdded: "Más antiguos",
        titleAZ: "Título A–Z",

        lectures: "Clases",

        lectureCount: (visible, total) => `${visible} de ${total} ${total === 1 ? "clase" : "clases"}`,

        noCoursesYet: "Aún no hay cursos",
        noCoursesDescription: "Tus cursos y clases aparecerán aquí cuando estén disponibles.",

        noLecturesYet: "Aún no hay clases",
        teacherNoLecturesDescription: "Sube la primera grabación de una clase para comenzar.",
        memberNoLecturesDescription: "Las clases aparecerán aquí cuando el profesor las agregue.",

        noMatchingLectures: "No se encontraron clases",
        noMatchingDescription: "Prueba otra búsqueda o un estado de procesamiento diferente.",

        viewLecture: "Ver clase",
        clearFilters: "Borrar filtros",
    },

    ar: {
        course: "المقرر",
        noCoursesAvailable: "لا توجد مقررات متاحة",

        findLecture: "البحث عن محاضرة",
        searchLectures: "ابحث في المحاضرات…",

        processingState: "حالة المعالجة",
        allStates: "جميع الحالات",

        statusLabels: {
            ready: "جاهزة",
            processing: "قيد المعالجة",
            uploaded: "تم الرفع",
            failed: "فشلت",
            pending: "معلقة",
        },

        sortBy: "ترتيب حسب",
        newestAdded: "الأحدث إضافة",
        oldestAdded: "الأقدم إضافة",
        titleAZ: "العنوان أبجديًا",

        lectures: "المحاضرات",

        lectureCount: (visible, total) => `${visible} من ${total} محاضرة`,

        noCoursesYet: "لا توجد مقررات بعد",
        noCoursesDescription: "ستظهر مقرراتك ومحاضراتك هنا عند توفرها.",

        noLecturesYet: "لا توجد محاضرات بعد",
        teacherNoLecturesDescription: "ارفع أول تسجيل محاضرة للبدء.",
        memberNoLecturesDescription: "ستظهر المحاضرات هنا عندما يضيفها المدرس.",

        noMatchingLectures: "لا توجد محاضرات مطابقة",
        noMatchingDescription: "جرّب بحثًا مختلفًا أو حالة معالجة أخرى.",

        viewLecture: "عرض المحاضرة",
        clearFilters: "مسح عوامل التصفية",
    },

    de: {
        course: "Kurs",
        noCoursesAvailable: "Keine Kurse verfügbar",

        findLecture: "Vorlesung suchen",
        searchLectures: "Vorlesungen durchsuchen…",

        processingState: "Verarbeitungsstatus",
        allStates: "Alle Status",

        statusLabels: {
            ready: "Bereit",
            processing: "In Bearbeitung",
            uploaded: "Hochgeladen",
            failed: "Fehlgeschlagen",
            pending: "Ausstehend",
        },

        sortBy: "Sortieren nach",
        newestAdded: "Neueste zuerst",
        oldestAdded: "Älteste zuerst",
        titleAZ: "Titel A–Z",

        lectures: "Vorlesungen",

        lectureCount: (visible, total) => `${visible} von ${total} ${total === 1 ? "Vorlesung" : "Vorlesungen"}`,

        noCoursesYet: "Noch keine Kurse",
        noCoursesDescription: "Deine Kurse und Vorlesungen werden hier angezeigt, sobald sie verfügbar sind.",

        noLecturesYet: "Noch keine Vorlesungen",
        teacherNoLecturesDescription: "Lade deine erste Vorlesungsaufnahme hoch, um zu beginnen.",
        memberNoLecturesDescription: "Vorlesungen erscheinen hier, sobald die Lehrkraft sie hinzufügt.",

        noMatchingLectures: "Keine passenden Vorlesungen",
        noMatchingDescription: "Versuche eine andere Suche oder einen anderen Verarbeitungsstatus.",

        viewLecture: "Vorlesung öffnen",
        clearFilters: "Filter löschen",
    },

    fr: {
        course: "Cours",
        noCoursesAvailable: "Aucun cours disponible",

        findLecture: "Rechercher un cours",
        searchLectures: "Rechercher des cours…",

        processingState: "État du traitement",
        allStates: "Tous les états",

        statusLabels: {
            ready: "Prêt",
            processing: "En traitement",
            uploaded: "Téléversé",
            failed: "Échec",
            pending: "En attente",
        },

        sortBy: "Trier par",
        newestAdded: "Plus récents",
        oldestAdded: "Plus anciens",
        titleAZ: "Titre A–Z",

        lectures: "Cours",

        lectureCount: (visible, total) => `${visible} sur ${total} cours`,

        noCoursesYet: "Aucun cours pour le moment",
        noCoursesDescription: "Vos cours apparaîtront ici lorsqu’ils seront disponibles.",

        noLecturesYet: "Aucun cours pour le moment",
        teacherNoLecturesDescription: "Téléversez votre premier enregistrement pour commencer.",
        memberNoLecturesDescription: "Les cours apparaîtront ici lorsque l’enseignant les ajoutera.",

        noMatchingLectures: "Aucun cours correspondant",
        noMatchingDescription: "Essayez une autre recherche ou un autre état de traitement.",

        viewLecture: "Voir le cours",
        clearFilters: "Effacer les filtres",
    },
};

interface LectureListProps {
    courses: Course[];
    course?: Course;
    query: string;
    status: Status | "all";
    sort: LectureSort;
    onCourseChange: (id: string) => void;
    onQueryChange: (value: string) => void;
    onStatusChange: (value: Status | "all") => void;
    onSortChange: (value: LectureSort) => void;
    onOpenLecture: (id: string) => void;
}

export default function LectureList({
    courses,
    course,
    query,
    status,
    sort,
    onCourseChange,
    onQueryChange,
    onStatusChange,
    onSortChange,
    onOpenLecture,
}: LectureListProps) {
    const { language } = useTranslation();

    const messages = messagesByLanguage[language];

    const normalizedQuery = query.trim().toLowerCase();

    const courseLectures = course?.lectures ?? [];

    const lectures = courseLectures.filter(
        (lecture) =>
            (status === "all" || lecture.status === status) &&
            `${lecture.title} ${lecture.description}`.toLowerCase().includes(normalizedQuery),
    );

    lectures.sort((first, second) => {
        if (sort === "title") {
            return first.title.localeCompare(second.title, "en", {
                numeric: true,
                sensitivity: "base",
            });
        }

        // Lecture IDs increase as records are added;
        // the API does not expose creation dates.
        return sort === "newest" ? Number(second.id) - Number(first.id) : Number(first.id) - Number(second.id);
    });

    let emptyState = {
        title: messages.noCoursesYet,
        description: messages.noCoursesDescription,
    };

    if (course) {
        emptyState = {
            title: messages.noLecturesYet,
            description: course.role === "teacher" ? messages.teacherNoLecturesDescription : messages.memberNoLecturesDescription,
        };

        if (courseLectures.length > 0) {
            emptyState = {
                title: messages.noMatchingLectures,
                description: messages.noMatchingDescription,
            };
        }
    }

    const OpenIcon = language === "ar" ? ArrowLeftIcon : ArrowRightIcon;

    return (
        <section aria-labelledby="lecture-list-heading">
            <div className="lecture-filters">
                <label>
                    {messages.course}

                    <select
                        value={course?.id ?? ""}
                        disabled={courses.length === 0}
                        onChange={(event) => onCourseChange(event.target.value)}
                    >
                        {courses.length === 0 && <option value="">{messages.noCoursesAvailable}</option>}

                        {courses.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.code} · {item.name}
                            </option>
                        ))}
                    </select>
                </label>

                <label>
                    {messages.findLecture}

                    <input
                        type="search"
                        value={query}
                        placeholder={messages.searchLectures}
                        onChange={(event) => onQueryChange(event.target.value)}
                    />
                </label>

                <label>
                    {messages.processingState}

                    <select
                        value={status}
                        onChange={(event) => {
                            const value = statuses.find((item) => item === event.target.value) ?? "all";

                            onStatusChange(value);
                        }}
                    >
                        <option value="all">{messages.allStates}</option>

                        {statuses.map((item) => (
                            <option key={item} value={item}>
                                {messages.statusLabels[item]}
                            </option>
                        ))}
                    </select>
                </label>

                <label>
                    {messages.sortBy}

                    <select
                        value={sort}
                        onChange={(event) => {
                            const value = event.target.value;

                            if (value === "newest" || value === "oldest" || value === "title") {
                                onSortChange(value);
                            }
                        }}
                    >
                        <option value="newest">{messages.newestAdded}</option>

                        <option value="oldest">{messages.oldestAdded}</option>

                        <option value="title">{messages.titleAZ}</option>
                    </select>
                </label>
            </div>

            <div className="lecture-list-heading">
                <div>
                    <h2 id="lecture-list-heading">{messages.lectures}</h2>

                    <p role="status">{messages.lectureCount(lectures.length, courseLectures.length)}</p>
                </div>
            </div>

            {course?.role === "teacher" && <LectureUploadForm key={course.id} courseId={course.id} onOpenLecture={onOpenLecture} />}

            {lectures.length > 0 ? (
                <ul className="lecture-list" role="list">
                    {lectures.map((lecture) => (
                        <li key={lecture.id}>
                            <button type="button" className="lecture-card" onClick={() => onOpenLecture(lecture.id)}>
                                <span className="lecture-card-top">
                                    <LectureStatus status={lecture.status} />
                                </span>

                                <span className="lecture-card-title">{lecture.title}</span>

                                <span className="lecture-card-description">{lecture.description}</span>

                                <span className="lecture-card-bottom">
                                    <span>{availabilitySummary(lecture)}</span>

                                    <span className="lecture-open">
                                        {messages.viewLecture}

                                        <OpenIcon size={18} aria-hidden />
                                    </span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="lecture-empty">
                    <BookOpenIcon size={32} aria-hidden />

                    <h3>{emptyState.title}</h3>

                    <p>{emptyState.description}</p>

                    {courseLectures.length > 0 && (
                        <button
                            type="button"
                            className="lecture-text-button"
                            onClick={() => {
                                onQueryChange("");

                                onStatusChange("all");
                            }}
                        >
                            {messages.clearFilters}
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}
