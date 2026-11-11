import { useAuth } from "../../api/auth/provider";
import type { Lecture } from "../../api/lectures/types";
import { createResourcesApi, resourceIndexingNote, resourceQueryKey } from "../../api/resources/client";
import type { ResourceOperation } from "../../api/resources/client";
import { useTranslation } from "../../i18n/use-translation";
import type { InterfaceLanguage } from "../../pages/settings/language-preferences";
import { openInNewTab } from "./open-in-new-tab";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

interface CourseResourcesProps {
    courseId: string;
    lectures: Lecture[];
    canManage: boolean;
}

interface ResourceMessages {
    ariaLabel: string;
    title: string;
    description: string;

    pdfFiles: string;
    chooseFiles: string;
    noFilesSelected: string;
    filesSelected: (count: number) => string;

    associatedLecture: string;
    entireCourse: string;

    filesToUpload: string;
    waitingToRetry: string;
    readyToUpload: string;
    transferProgress: (name: string) => string;
    verifyingUpload: string;
    transferringFile: (progress: number) => string;
    remove: string;

    uploadPdf: string;
    uploadPdfs: (count: number) => string;
    cancelUpload: string;

    loadingResources: string;
    loadError: string;
    retry: string;
    noResources: string;

    available: string;
    pending: string;
    failed: string;

    associatedLectureFallback: string;

    pendingMessage: string;
    failedMessage: string;

    opening: string;
    openDownload: string;

    invalidFiles: (names: string) => string;
    uploadFailed: string;
    uploadCancelled: string;
    popupBlocked: string;
    openFailed: string;
}

const messagesByLanguage: Record<InterfaceLanguage, ResourceMessages> = {
    en: {
        ariaLabel: "Course resources",
        title: "Course Resources",
        description: "PDF lecture notes, assignments, and study guides shared with this course.",

        pdfFiles: "PDF files (up to 25 MB each)",
        chooseFiles: "Choose Files",
        noFilesSelected: "No files selected",
        filesSelected: (count) => `${count} files selected`,

        associatedLecture: "Associated lecture",
        entireCourse: "Entire course",

        filesToUpload: "Files to upload",
        waitingToRetry: "Waiting to retry",
        readyToUpload: "Ready to upload",
        transferProgress: (name) => `${name} transfer progress`,
        verifyingUpload: "Verifying upload…",
        transferringFile: (progress) => `Transferring file: ${progress}%`,
        remove: "Remove",

        uploadPdf: "Upload PDF",
        uploadPdfs: (count) => `Upload ${count} PDFs`,
        cancelUpload: "Cancel upload",

        loadingResources: "Loading resources…",
        loadError: "Could not load resources.",
        retry: "Retry",
        noResources: "No resources have been shared yet.",

        available: "Available",
        pending: "Pending",
        failed: "Failed",

        associatedLectureFallback: "Associated lecture",

        pendingMessage: "Awaiting upload verification. The uploading teacher can retry from their active upload.",
        failedMessage: "Upload failed. A teacher can select the file to start a new upload.",

        opening: "Opening…",
        openDownload: "Open / download PDF",

        invalidFiles: (names) => `Skipped ${names}. Each file must be a nonempty PDF up to 25 MB.`,
        uploadFailed: "Upload failed. Please retry.",
        uploadCancelled: "Upload cancelled. Retry to resume this file.",
        popupBlocked: "Allow popups and try opening the PDF again.",
        openFailed: "Could not open this PDF. Try again for a fresh link.",
    },

    es: {
        ariaLabel: "Recursos del curso",
        title: "Recursos del curso",
        description: "Notas de clase, tareas y guías de estudio en PDF compartidas con este curso.",

        pdfFiles: "Archivos PDF (hasta 25 MB cada uno)",
        chooseFiles: "Seleccionar archivos",
        noFilesSelected: "Ningún archivo seleccionado",
        filesSelected: (count) => `${count} archivos seleccionados`,

        associatedLecture: "Clase asociada",
        entireCourse: "Curso completo",

        filesToUpload: "Archivos para subir",
        waitingToRetry: "Esperando reintento",
        readyToUpload: "Listo para subir",
        transferProgress: (name) => `Progreso de transferencia de ${name}`,
        verifyingUpload: "Verificando subida…",
        transferringFile: (progress) => `Transfiriendo archivo: ${progress}%`,
        remove: "Eliminar",

        uploadPdf: "Subir PDF",
        uploadPdfs: (count) => `Subir ${count} PDF`,
        cancelUpload: "Cancelar subida",

        loadingResources: "Cargando recursos…",
        loadError: "No se pudieron cargar los recursos.",
        retry: "Reintentar",
        noResources: "Aún no se han compartido recursos.",

        available: "Disponible",
        pending: "Pendiente",
        failed: "Fallido",

        associatedLectureFallback: "Clase asociada",

        pendingMessage: "Esperando la verificación de la subida. El profesor puede reintentarlo desde la subida activa.",
        failedMessage: "La subida falló. Un profesor puede seleccionar el archivo para iniciar una nueva subida.",

        opening: "Abriendo…",
        openDownload: "Abrir / descargar PDF",

        invalidFiles: (names) => `Se omitieron ${names}. Cada archivo debe ser un PDF no vacío de hasta 25 MB.`,
        uploadFailed: "La subida falló. Inténtalo de nuevo.",
        uploadCancelled: "La subida fue cancelada. Reintenta para continuar este archivo.",
        popupBlocked: "Permite las ventanas emergentes e intenta abrir el PDF nuevamente.",
        openFailed: "No se pudo abrir este PDF. Inténtalo de nuevo.",
    },

    ar: {
        ariaLabel: "مصادر المقرر",
        title: "مصادر المقرر",
        description: "ملاحظات المحاضرات والواجبات وأدلة الدراسة بصيغة PDF المشتركة مع هذا المقرر.",

        pdfFiles: "ملفات PDF (حتى 25 ميجابايت لكل ملف)",
        chooseFiles: "اختيار الملفات",
        noFilesSelected: "لم يتم اختيار ملفات",
        filesSelected: (count) => `تم اختيار ${count} ملفات`,

        associatedLecture: "المحاضرة المرتبطة",
        entireCourse: "المقرر بالكامل",

        filesToUpload: "الملفات المطلوب رفعها",
        waitingToRetry: "بانتظار إعادة المحاولة",
        readyToUpload: "جاهز للرفع",
        transferProgress: (name) => `تقدم نقل ${name}`,
        verifyingUpload: "جارٍ التحقق من الرفع…",
        transferringFile: (progress) => `جارٍ نقل الملف: ${progress}%`,
        remove: "إزالة",

        uploadPdf: "رفع PDF",
        uploadPdfs: (count) => `رفع ${count} ملفات PDF`,
        cancelUpload: "إلغاء الرفع",

        loadingResources: "جارٍ تحميل المصادر…",
        loadError: "تعذر تحميل المصادر.",
        retry: "إعادة المحاولة",
        noResources: "لم تتم مشاركة أي مصادر بعد.",

        available: "متاح",
        pending: "قيد الانتظار",
        failed: "فشل",

        associatedLectureFallback: "المحاضرة المرتبطة",

        pendingMessage: "بانتظار التحقق من الرفع. يمكن للمدرس إعادة المحاولة من عملية الرفع الحالية.",
        failedMessage: "فشل الرفع. يمكن للمدرس اختيار الملف لبدء عملية رفع جديدة.",

        opening: "جارٍ الفتح…",
        openDownload: "فتح / تنزيل PDF",

        invalidFiles: (names) => `تم تخطي ${names}. يجب أن يكون كل ملف PDF غير فارغ وبحجم لا يزيد عن 25 ميجابايت.`,
        uploadFailed: "فشل الرفع. حاول مرة أخرى.",
        uploadCancelled: "تم إلغاء الرفع. أعد المحاولة لمتابعة هذا الملف.",
        popupBlocked: "اسمح بالنوافذ المنبثقة ثم حاول فتح ملف PDF مرة أخرى.",
        openFailed: "تعذر فتح ملف PDF. حاول مرة أخرى.",
    },

    de: {
        ariaLabel: "Kursmaterialien",
        title: "Kursmaterialien",
        description: "PDF-Vorlesungsnotizen, Aufgaben und Lernhilfen, die mit diesem Kurs geteilt wurden.",

        pdfFiles: "PDF-Dateien (jeweils bis zu 25 MB)",
        chooseFiles: "Dateien auswählen",
        noFilesSelected: "Keine Dateien ausgewählt",
        filesSelected: (count) => `${count} Dateien ausgewählt`,

        associatedLecture: "Zugehörige Vorlesung",
        entireCourse: "Gesamter Kurs",

        filesToUpload: "Dateien zum Hochladen",
        waitingToRetry: "Wartet auf erneuten Versuch",
        readyToUpload: "Bereit zum Hochladen",
        transferProgress: (name) => `Übertragungsfortschritt von ${name}`,
        verifyingUpload: "Upload wird überprüft…",
        transferringFile: (progress) => `Datei wird übertragen: ${progress}%`,
        remove: "Entfernen",

        uploadPdf: "PDF hochladen",
        uploadPdfs: (count) => `${count} PDFs hochladen`,
        cancelUpload: "Upload abbrechen",

        loadingResources: "Materialien werden geladen…",
        loadError: "Materialien konnten nicht geladen werden.",
        retry: "Erneut versuchen",
        noResources: "Es wurden noch keine Materialien geteilt.",

        available: "Verfügbar",
        pending: "Ausstehend",
        failed: "Fehlgeschlagen",

        associatedLectureFallback: "Zugehörige Vorlesung",

        pendingMessage: "Die Upload-Überprüfung steht noch aus. Die Lehrkraft kann den Upload erneut versuchen.",
        failedMessage: "Der Upload ist fehlgeschlagen. Eine Lehrkraft kann die Datei auswählen und einen neuen Upload starten.",

        opening: "Wird geöffnet…",
        openDownload: "PDF öffnen / herunterladen",

        invalidFiles: (names) => `${names} wurden übersprungen. Jede Datei muss eine nicht leere PDF-Datei mit höchstens 25 MB sein.`,
        uploadFailed: "Upload fehlgeschlagen. Versuche es erneut.",
        uploadCancelled: "Upload abgebrochen. Versuche es erneut, um diese Datei fortzusetzen.",
        popupBlocked: "Erlaube Pop-ups und versuche erneut, die PDF-Datei zu öffnen.",
        openFailed: "Diese PDF-Datei konnte nicht geöffnet werden. Versuche es erneut.",
    },

    fr: {
        ariaLabel: "Ressources du cours",
        title: "Ressources du cours",
        description: "Notes de cours, devoirs et guides d’étude PDF partagés avec ce cours.",

        pdfFiles: "Fichiers PDF (25 Mo maximum chacun)",
        chooseFiles: "Choisir des fichiers",
        noFilesSelected: "Aucun fichier sélectionné",
        filesSelected: (count) => `${count} fichiers sélectionnés`,

        associatedLecture: "Cours associé",
        entireCourse: "Cours entier",

        filesToUpload: "Fichiers à téléverser",
        waitingToRetry: "En attente d’une nouvelle tentative",
        readyToUpload: "Prêt à téléverser",
        transferProgress: (name) => `Progression du transfert de ${name}`,
        verifyingUpload: "Vérification du téléversement…",
        transferringFile: (progress) => `Transfert du fichier : ${progress}%`,
        remove: "Supprimer",

        uploadPdf: "Téléverser le PDF",
        uploadPdfs: (count) => `Téléverser ${count} PDF`,
        cancelUpload: "Annuler le téléversement",

        loadingResources: "Chargement des ressources…",
        loadError: "Impossible de charger les ressources.",
        retry: "Réessayer",
        noResources: "Aucune ressource n’a encore été partagée.",

        available: "Disponible",
        pending: "En attente",
        failed: "Échec",

        associatedLectureFallback: "Cours associé",

        pendingMessage: "En attente de la vérification du téléversement. L’enseignant peut réessayer depuis le téléversement actif.",
        failedMessage: "Le téléversement a échoué. Un enseignant peut sélectionner le fichier pour démarrer un nouveau téléversement.",

        opening: "Ouverture…",
        openDownload: "Ouvrir / télécharger le PDF",

        invalidFiles: (names) => `${names} ont été ignorés. Chaque fichier doit être un PDF non vide de 25 Mo maximum.`,
        uploadFailed: "Le téléversement a échoué. Réessayez.",
        uploadCancelled: "Le téléversement a été annulé. Réessayez pour reprendre ce fichier.",
        popupBlocked: "Autorisez les fenêtres contextuelles puis essayez d’ouvrir le PDF à nouveau.",
        openFailed: "Impossible d’ouvrir ce PDF. Réessayez.",
    },
};

interface QueuedFile {
    id: string;
    file: File;
    operation?: ResourceOperation;
    status: "waiting" | "uploading" | "failed";
    progress: number;
    error?: string;
}

const MAX_RESOURCE_BYTES = 25 * 1024 ** 2;

function isUploadablePdf(file: File) {
    return file.size > 0 && file.size <= MAX_RESOURCE_BYTES && file.name.toLowerCase().endsWith(".pdf");
}

export default function CourseResources(props: CourseResourcesProps) {
    const { state, apiFetch } = useAuth();

    const api = useMemo(() => createResourcesApi(apiFetch), [apiFetch]);

    if (state.status !== "authenticated") {
        return null;
    }

    return <ResourceLibrary key={`${state.user.id}:${props.courseId}:${props.canManage}`} {...props} accountId={state.user.id} api={api} />;
}

export function ResourceLibrary({
    courseId,
    lectures,
    canManage,
    accountId,
    api,
}: CourseResourcesProps & {
    accountId: string;
    api: ReturnType<typeof createResourcesApi>;
}) {
    const { language } = useTranslation();

    const messages = messagesByLanguage[language];

    const queryClient = useQueryClient();

    const queryKey = resourceQueryKey(accountId, courseId);

    const resources = useQuery({
        queryKey,
        queryFn: ({ signal }) => api.list(courseId, signal),
    });

    const [queue, setQueue] = useState<QueuedFile[]>([]);

    const [lectureId, setLectureId] = useState("");

    const [busy, setBusy] = useState(false);

    const [error, setError] = useState("");

    const [opening, setOpening] = useState<string | null>(null);

    const lifetime = useRef<AbortController | null>(null);

    const uploadController = useRef<AbortController | null>(null);

    const fileInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const controller = new AbortController();

        lifetime.current = controller;

        return () => {
            controller.abort();
            uploadController.current?.abort();
        };
    }, []);

    function updateQueued(id: string, patch: Partial<QueuedFile>) {
        setQueue((current) =>
            current.map((item) =>
                item.id === id
                    ? {
                          ...item,
                          ...patch,
                      }
                    : item,
            ),
        );
    }

    function select(files: FileList | null) {
        const chosen = [...(files ?? [])];

        const skipped = chosen.filter((file) => !isUploadablePdf(file)).map((file) => file.name);

        const accepted: QueuedFile[] = chosen
            .filter((file) => isUploadablePdf(file))
            .map((file) => ({
                id: crypto.randomUUID(),
                file,
                status: "waiting",
                progress: 0,
            }));

        setQueue((current) => [...current, ...accepted]);

        setError(skipped.length > 0 ? messages.invalidFiles(skipped.join(", ")) : "");

        if (fileInput.current) {
            fileInput.current.value = "";
        }
    }

    async function uploadQueued() {
        if (busy || !canManage || queue.length === 0) {
            return;
        }

        const controller = new AbortController();

        uploadController.current = controller;

        setBusy(true);
        setError("");

        for (const item of queue) {
            if (controller.signal.aborted || lifetime.current?.signal.aborted) {
                break;
            }

            const operation = item.operation ?? {
                file: item.file,
                lectureId: lectureId || undefined,
                key: crypto.randomUUID(),
            };

            updateQueued(item.id, {
                operation,
                status: "uploading",
                progress: 0,
                error: undefined,
            });

            try {
                await api.upload(courseId, operation, controller.signal, (value) => {
                    if (!controller.signal.aborted) {
                        updateQueued(item.id, {
                            progress: value,
                        });
                    }
                });

                setQueue((current) => current.filter((queued) => queued.id !== item.id));
            } catch (error_) {
                if (lifetime.current?.signal.aborted) {
                    return;
                }

                let message = language === "en" && error_ instanceof Error ? error_.message : messages.uploadFailed;

                if (controller.signal.aborted) {
                    message = messages.uploadCancelled;
                }

                updateQueued(item.id, {
                    status: "failed",
                    error: message,
                });
            }

            void queryClient.invalidateQueries({
                queryKey,
            });
        }

        if (!lifetime.current?.signal.aborted) {
            setBusy(false);
        }
    }

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
                setError(messages.popupBlocked);
            }
        } catch (error_) {
            if (!signal.aborted) {
                setError(language === "en" && error_ instanceof Error ? error_.message : messages.openFailed);
            }
        } finally {
            if (!signal.aborted) {
                setOpening(null);
            }
        }
    }

    const selectedFilesText =
        queue.length === 0
            ? messages.noFilesSelected
            : queue.length === 1
              ? (queue[0]?.file.name ?? messages.noFilesSelected)
              : messages.filesSelected(queue.length);

    return (
        <section className="resources-container" aria-label={messages.ariaLabel}>
            <h2>{messages.title}</h2>

            <p className="resources-desc">{messages.description}</p>

            {canManage && (
                <div className="resources-card">
                    <label className="resources-label">{messages.pdfFiles}</label>

                    <input
                        ref={fileInput}
                        id="resource-file"
                        type="file"
                        multiple
                        accept=".pdf,application/pdf"
                        disabled={busy}
                        onChange={(event) => select(event.target.files)}
                        style={{
                            display: "none",
                        }}
                    />

                    <div
                        style={{
                            display: "flex",
                            gap: "0.75rem",
                            alignItems: "center",
                            flexWrap: "wrap",
                        }}
                    >
                        <button type="button" className="resources-view-btn" disabled={busy} onClick={() => fileInput.current?.click()}>
                            {messages.chooseFiles}
                        </button>

                        <span>{selectedFilesText}</span>
                    </div>

                    <label htmlFor="resource-lecture">{messages.associatedLecture}</label>

                    <select
                        id="resource-lecture"
                        value={lectureId}
                        disabled={busy || queue.some((item) => item.operation)}
                        onChange={(event) => setLectureId(event.target.value)}
                        className="resources-input"
                    >
                        <option value="">{messages.entireCourse}</option>

                        {lectures.map((lecture) => (
                            <option key={lecture.id} value={lecture.id}>
                                {lecture.title}
                            </option>
                        ))}
                    </select>

                    {queue.length > 0 && (
                        <ul className="resources-queue" aria-label={messages.filesToUpload}>
                            {queue.map((item) => (
                                <li key={item.id} className="resources-queue-item">
                                    <span className="resources-file-name">{item.file.name}</span>

                                    {item.status === "waiting" && (
                                        <p>{item.operation ? messages.waitingToRetry : messages.readyToUpload}</p>
                                    )}

                                    {item.status === "uploading" && (
                                        <>
                                            <progress
                                                max={100}
                                                value={item.progress}
                                                aria-label={messages.transferProgress(item.file.name)}
                                            />

                                            <p role="status">
                                                {item.progress === 100
                                                    ? messages.verifyingUpload
                                                    : messages.transferringFile(item.progress)}
                                            </p>
                                        </>
                                    )}

                                    {item.status === "failed" && <p role="alert">{item.error}</p>}

                                    {!busy && (
                                        <button
                                            type="button"
                                            className="resources-view-btn"
                                            onClick={() => setQueue((current) => current.filter((queued) => queued.id !== item.id))}
                                        >
                                            {messages.remove}
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}

                    <button
                        type="button"
                        className="resources-btn"
                        disabled={queue.length === 0 || busy}
                        onClick={() => void uploadQueued()}
                    >
                        {queue.length > 1 ? messages.uploadPdfs(queue.length) : messages.uploadPdf}
                    </button>

                    {busy && (
                        <button type="button" className="resources-view-btn" onClick={() => uploadController.current?.abort()}>
                            {messages.cancelUpload}
                        </button>
                    )}
                </div>
            )}

            {error && <p role="alert">{error}</p>}

            {resources.isPending && <p role="status">{messages.loadingResources}</p>}

            {resources.isError && (
                <p role="alert">
                    {messages.loadError}{" "}
                    <button type="button" onClick={() => void resources.refetch()}>
                        {messages.retry}
                    </button>
                </p>
            )}

            {resources.isSuccess && resources.data.length === 0 && <p>{messages.noResources}</p>}

            <ul className="resources-list">
                {resources.data?.map((resource) => {
                    const indexingNote = resourceIndexingNote(resource);

                    let statusText: string = resource.uploadStatus;

                    switch (resource.uploadStatus) {
                        case "uploaded": {
                            statusText = messages.available;

                            break;
                        }
                        case "pending": {
                            statusText = messages.pending;

                            break;
                        }
                        case "failed": {
                            statusText = messages.failed;

                            break;
                        }
                        // No default
                    }

                    return (
                        <li key={resource.id} className="resources-item">
                            <div>
                                <span className="resources-file-name">{resource.name}</span>

                                <p>
                                    {Math.ceil(resource.contentLength / 1024)} KB · {statusText}
                                </p>

                                {resource.lectureId && (
                                    <p>
                                        {lectures.find((lecture) => lecture.id === resource.lectureId)?.title ??
                                            messages.associatedLectureFallback}
                                    </p>
                                )}

                                {resource.uploadStatus === "pending" && <p>{messages.pendingMessage}</p>}

                                {resource.uploadStatus === "failed" && <p>{messages.failedMessage}</p>}

                                {indexingNote && <p>{indexingNote}</p>}
                            </div>

                            {resource.uploadStatus === "uploaded" && (
                                <button
                                    type="button"
                                    className="resources-view-btn"
                                    disabled={opening !== null}
                                    onClick={() => void open(resource.id)}
                                >
                                    {opening === resource.id ? messages.opening : messages.openDownload}
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
