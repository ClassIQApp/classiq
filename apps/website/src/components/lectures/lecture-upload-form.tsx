import { useAuth } from "../../api/auth/provider";
import type { ProcessingRunResult } from "../../api/lectures/processing";
import { RecordingSession } from "../../api/lectures/recording-session";
import { useRetryProcessing } from "../../api/lectures/use-lecture";
import { useTranslation } from "../../i18n/use-translation";
import type { InterfaceLanguage } from "../../pages/settings/language-preferences";
import { retryErrorMessage } from "./processing-notice";
import { PlusIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

interface LectureUploadFormProps {
    courseId: string;
    onOpenLecture?: (lectureId: string) => void;
}

interface SavedRecording {
    lectureId: string;
    processing?: ProcessingRunResult;
}

interface LectureUploadMessages {
    uploadLecture: string;
    retryRecording: string;
    uploading: string;

    uploadDescription: string;

    cancelUpload: string;
    close: string;

    lectureTitle: string;
    titlePlaceholder: string;

    description: string;
    descriptionPlaceholder: string;

    recording: string;

    chooseSupportedRecording: string;
    chooseValidSize: string;
    chooseRecordingFile: string;
    uploadFailed: string;

    uploadPaused: string;

    transferProgress: string;
    verifying: string;
    transferred: (current: string, total: string) => string;

    recordingSaved: string;
    processingStarted: string;
    processingDidNotStart: string;
    recordingSafe: string;

    retryFailed: string;
    starting: string;
    retryProcessing: string;
    openLecture: string;
}

const messagesByLanguage: Record<InterfaceLanguage, LectureUploadMessages> = {
    en: {
        uploadLecture: "Upload Lecture",
        retryRecording: "Retry recording",
        uploading: "Uploading…",

        uploadDescription: "Add the lecture information and select its recording.",

        cancelUpload: "Cancel upload",
        close: "Close",

        lectureTitle: "Lecture Title",
        titlePlaceholder: "Introduction to Operating Systems",

        description: "Description",
        descriptionPlaceholder: "Enter a short lecture description",

        recording: "Recording",

        chooseSupportedRecording: "Choose a supported audio or video recording.",
        chooseValidSize: "Choose a nonempty recording of 500 MB or smaller.",
        chooseRecordingFile: "Choose a recording file.",
        uploadFailed: "Lecture recording could not be uploaded.",

        uploadPaused: "Upload paused. Retry to resume while this form stays open; closing it starts over.",

        transferProgress: "Recording transfer progress",
        verifying: "Transferred. Verifying and saving the recording…",
        transferred: (current, total) => `${current} of ${total} MB transferred`,

        recordingSaved: "Recording saved.",
        processingStarted: "Recording saved. Processing has started, and the lecture updates as study materials are ready.",
        processingDidNotStart: "Recording saved, but processing didn't start.",
        recordingSafe: "The recording is safe, so retry processing without uploading again.",

        retryFailed: "Processing could not be started. Try again.",
        starting: "Starting…",
        retryProcessing: "Retry processing",
        openLecture: "Open lecture",
    },

    es: {
        uploadLecture: "Subir clase",
        retryRecording: "Reintentar grabación",
        uploading: "Subiendo…",

        uploadDescription: "Agrega la información de la clase y selecciona su grabación.",

        cancelUpload: "Cancelar subida",
        close: "Cerrar",

        lectureTitle: "Título de la clase",
        titlePlaceholder: "Introducción a los sistemas operativos",

        description: "Descripción",
        descriptionPlaceholder: "Ingresa una breve descripción de la clase",

        recording: "Grabación",

        chooseSupportedRecording: "Selecciona una grabación de audio o video compatible.",
        chooseValidSize: "Selecciona una grabación que no esté vacía y que sea de 500 MB o menos.",
        chooseRecordingFile: "Selecciona un archivo de grabación.",
        uploadFailed: "No se pudo subir la grabación de la clase.",

        uploadPaused:
            "La subida se pausó. Reintenta para continuar mientras este formulario permanezca abierto; cerrarlo reiniciará el proceso.",

        transferProgress: "Progreso de transferencia de la grabación",
        verifying: "Transferido. Verificando y guardando la grabación…",
        transferred: (current, total) => `${current} de ${total} MB transferidos`,

        recordingSaved: "Grabación guardada.",
        processingStarted:
            "Grabación guardada. El procesamiento ha comenzado y la clase se actualizará cuando los materiales estén listos.",
        processingDidNotStart: "La grabación se guardó, pero el procesamiento no comenzó.",
        recordingSafe: "La grabación está segura. Puedes reintentar el procesamiento sin volver a subirla.",

        retryFailed: "No se pudo iniciar el procesamiento. Inténtalo de nuevo.",
        starting: "Iniciando…",
        retryProcessing: "Reintentar procesamiento",
        openLecture: "Abrir clase",
    },

    ar: {
        uploadLecture: "رفع محاضرة",
        retryRecording: "إعادة محاولة التسجيل",
        uploading: "جارٍ الرفع…",

        uploadDescription: "أضف معلومات المحاضرة واختر ملف التسجيل.",

        cancelUpload: "إلغاء الرفع",
        close: "إغلاق",

        lectureTitle: "عنوان المحاضرة",
        titlePlaceholder: "مقدمة في أنظمة التشغيل",

        description: "الوصف",
        descriptionPlaceholder: "أدخل وصفًا مختصرًا للمحاضرة",

        recording: "التسجيل",

        chooseSupportedRecording: "اختر تسجيل صوت أو فيديو مدعومًا.",
        chooseValidSize: "اختر تسجيلًا غير فارغ بحجم 500 ميجابايت أو أقل.",
        chooseRecordingFile: "اختر ملف تسجيل.",
        uploadFailed: "تعذر رفع تسجيل المحاضرة.",

        uploadPaused: "تم إيقاف الرفع مؤقتًا. أعد المحاولة للمتابعة ما دام هذا النموذج مفتوحًا؛ إغلاقه سيبدأ العملية من جديد.",

        transferProgress: "تقدم نقل التسجيل",
        verifying: "تم النقل. جارٍ التحقق من التسجيل وحفظه…",
        transferred: (current, total) => `تم نقل ${current} من ${total} ميجابايت`,

        recordingSaved: "تم حفظ التسجيل.",
        processingStarted: "تم حفظ التسجيل وبدأت المعالجة. سيتم تحديث المحاضرة تلقائيًا عندما تصبح مواد الدراسة جاهزة.",
        processingDidNotStart: "تم حفظ التسجيل، لكن المعالجة لم تبدأ.",
        recordingSafe: "التسجيل محفوظ بأمان. يمكنك إعادة محاولة المعالجة دون رفع التسجيل مرة أخرى.",

        retryFailed: "تعذر بدء المعالجة. حاول مرة أخرى.",
        starting: "جارٍ البدء…",
        retryProcessing: "إعادة محاولة المعالجة",
        openLecture: "فتح المحاضرة",
    },

    de: {
        uploadLecture: "Vorlesung hochladen",
        retryRecording: "Aufnahme erneut versuchen",
        uploading: "Wird hochgeladen…",

        uploadDescription: "Füge die Informationen zur Vorlesung hinzu und wähle die Aufnahme aus.",

        cancelUpload: "Upload abbrechen",
        close: "Schließen",

        lectureTitle: "Vorlesungstitel",
        titlePlaceholder: "Einführung in Betriebssysteme",

        description: "Beschreibung",
        descriptionPlaceholder: "Gib eine kurze Beschreibung der Vorlesung ein",

        recording: "Aufnahme",

        chooseSupportedRecording: "Wähle eine unterstützte Audio- oder Videoaufnahme aus.",
        chooseValidSize: "Wähle eine nicht leere Aufnahme mit höchstens 500 MB.",
        chooseRecordingFile: "Wähle eine Aufnahmedatei aus.",
        uploadFailed: "Die Vorlesungsaufnahme konnte nicht hochgeladen werden.",

        uploadPaused:
            "Der Upload wurde pausiert. Versuche es erneut, um fortzufahren. Wenn du dieses Formular schließt, beginnt der Vorgang von vorne.",

        transferProgress: "Übertragungsfortschritt der Aufnahme",
        verifying: "Übertragen. Aufnahme wird geprüft und gespeichert…",
        transferred: (current, total) => `${current} von ${total} MB übertragen`,

        recordingSaved: "Aufnahme gespeichert.",
        processingStarted:
            "Aufnahme gespeichert. Die Verarbeitung wurde gestartet und die Vorlesung wird aktualisiert, sobald die Lernmaterialien bereit sind.",
        processingDidNotStart: "Die Aufnahme wurde gespeichert, aber die Verarbeitung wurde nicht gestartet.",
        recordingSafe: "Die Aufnahme ist sicher gespeichert. Du kannst die Verarbeitung erneut starten, ohne sie noch einmal hochzuladen.",

        retryFailed: "Die Verarbeitung konnte nicht gestartet werden. Versuche es erneut.",
        starting: "Wird gestartet…",
        retryProcessing: "Verarbeitung erneut starten",
        openLecture: "Vorlesung öffnen",
    },

    fr: {
        uploadLecture: "Téléverser un cours",
        retryRecording: "Réessayer l’enregistrement",
        uploading: "Téléversement…",

        uploadDescription: "Ajoutez les informations du cours et sélectionnez son enregistrement.",

        cancelUpload: "Annuler le téléversement",
        close: "Fermer",

        lectureTitle: "Titre du cours",
        titlePlaceholder: "Introduction aux systèmes d’exploitation",

        description: "Description",
        descriptionPlaceholder: "Entrez une courte description du cours",

        recording: "Enregistrement",

        chooseSupportedRecording: "Sélectionnez un enregistrement audio ou vidéo pris en charge.",
        chooseValidSize: "Sélectionnez un enregistrement non vide de 500 Mo maximum.",
        chooseRecordingFile: "Sélectionnez un fichier d’enregistrement.",
        uploadFailed: "Impossible de téléverser l’enregistrement du cours.",

        uploadPaused:
            "Le téléversement est en pause. Réessayez pour continuer tant que ce formulaire reste ouvert ; le fermer recommencera le processus.",

        transferProgress: "Progression du transfert de l’enregistrement",
        verifying: "Transfert terminé. Vérification et enregistrement en cours…",
        transferred: (current, total) => `${current} sur ${total} Mo transférés`,

        recordingSaved: "Enregistrement sauvegardé.",
        processingStarted:
            "Enregistrement sauvegardé. Le traitement a commencé et le cours sera mis à jour lorsque les supports seront prêts.",
        processingDidNotStart: "L’enregistrement a été sauvegardé, mais le traitement n’a pas démarré.",
        recordingSafe: "L’enregistrement est sauvegardé. Vous pouvez relancer le traitement sans le téléverser à nouveau.",

        retryFailed: "Impossible de démarrer le traitement. Réessayez.",
        starting: "Démarrage…",
        retryProcessing: "Relancer le traitement",
        openLecture: "Ouvrir le cours",
    },
};

const supportedTypes = new Set(["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/webm", "video/mp4", "video/webm"]);

const maxFileSize = 500 * 1024 ** 2;

export default function LectureUploadForm({ courseId, onOpenLecture }: LectureUploadFormProps) {
    const { state } = useAuth();

    return (
        <RecordingForm
            key={`${state.status === "authenticated" ? state.user.id : state.status}:${courseId}`}
            courseId={courseId}
            onOpenLecture={onOpenLecture}
        />
    );
}

function formatMegabytes(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(1);
}

function RecordingForm({ courseId, onOpenLecture }: LectureUploadFormProps) {
    const { apiFetch } = useAuth();
    const { language } = useTranslation();

    const messages = messagesByLanguage[language];

    const session = useRef(new RecordingSession());

    const active = useRef<AbortController | null>(null);

    useEffect(
        () => () => {
            active.current?.abort();
        },
        [apiFetch, courseId],
    );

    const queryClient = useQueryClient();

    const [open, setOpen] = useState(false);

    const [title, setTitle] = useState("");

    const [description, setDescription] = useState("");

    const [file, setFile] = useState<File | null>(null);

    const [progress, setProgress] = useState(0);

    const [uploading, setUploading] = useState(false);

    const [saved, setSaved] = useState<SavedRecording | null>(null);

    const [error, setError] = useState("");

    const retry = useRetryProcessing(courseId);

    function reset() {
        session.current = new RecordingSession();

        setTitle("");
        setDescription("");
        setFile(null);
        setProgress(0);
        setSaved(null);
        setError("");

        retry.reset();
    }

    function chooseFile(selected: File | null) {
        session.current = new RecordingSession();

        setError("");
        setSaved(null);
        setProgress(0);

        if (!selected) {
            setFile(null);

            return;
        }

        if (!supportedTypes.has(selected.type)) {
            setFile(null);

            setError(messages.chooseSupportedRecording);

            return;
        }

        if (selected.size === 0 || selected.size > maxFileSize) {
            setFile(null);

            setError(messages.chooseValidSize);

            return;
        }

        setFile(selected);
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!file) {
            setError(messages.chooseRecordingFile);

            return;
        }

        const controller = new AbortController();

        active.current = controller;

        try {
            setUploading(true);
            setError("");
            setSaved(null);
            retry.reset();
            setProgress(0);

            const asset = await session.current.run(apiFetch, courseId, title, description, file, controller.signal, setProgress, () =>
                queryClient.invalidateQueries({
                    queryKey: ["courses"],
                }),
            );

            if (controller.signal.aborted) {
                return;
            }

            setSaved({
                lectureId: session.current.lectureId!,
                processing: asset.processing,
            });

            session.current = new RecordingSession();

            setTitle("");
            setDescription("");
            setFile(null);
            setProgress(100);
        } catch (uploadError) {
            if (controller.signal.aborted) {
                return;
            }

            setError(uploadError instanceof Error && language === "en" ? uploadError.message : messages.uploadFailed);
        } finally {
            if (!controller.signal.aborted) {
                setUploading(false);
            }
        }
    }

    function retryStart() {
        if (!saved) {
            return;
        }

        retry.mutate(saved.lectureId, {
            onSuccess: (run) =>
                setSaved({
                    ...saved,
                    processing: run,
                }),
        });
    }

    if (!open) {
        return (
            <button
                type="button"
                className="lecture-upload-open"
                onClick={() => {
                    reset();
                    setOpen(true);
                }}
            >
                <PlusIcon className="button-icon" weight="bold" aria-hidden />

                {messages.uploadLecture}
            </button>
        );
    }

    let submitLabel = messages.uploadLecture;

    if (session.current.lectureId) {
        submitLabel = messages.retryRecording;
    }

    if (uploading) {
        submitLabel = messages.uploading;
    }

    return (
        <div className="lecture-upload-panel">
            <div className="lecture-upload-heading">
                <div>
                    <h3>{messages.uploadLecture}</h3>

                    <p>{messages.uploadDescription}</p>
                </div>

                <button
                    type="button"
                    className="lecture-text-button"
                    onClick={() => {
                        if (!uploading) {
                            setOpen(false);
                            reset();

                            return;
                        }

                        active.current?.abort();

                        void queryClient.invalidateQueries({
                            queryKey: ["courses"],
                        });

                        setUploading(false);

                        setError(messages.uploadPaused);
                    }}
                >
                    {uploading ? messages.cancelUpload : messages.close}
                </button>
            </div>

            <form className="lecture-upload-form" onSubmit={handleSubmit}>
                <label>
                    {messages.lectureTitle}

                    <input
                        type="text"
                        value={title}
                        placeholder={messages.titlePlaceholder}
                        disabled={uploading || !!session.current.lectureId}
                        required
                        onChange={(event) => setTitle(event.target.value)}
                    />
                </label>

                <label>
                    {messages.description}

                    <textarea
                        value={description}
                        placeholder={messages.descriptionPlaceholder}
                        rows={3}
                        disabled={uploading || !!session.current.lectureId}
                        required
                        onChange={(event) => setDescription(event.target.value)}
                    />
                </label>

                <label>
                    {messages.recording}

                    <input
                        type="file"
                        accept="audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/webm,video/mp4,video/webm"
                        disabled={uploading || !!session.current.lectureId}
                        onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                    />
                </label>

                {file && (
                    <p className="lecture-upload-file">
                        {file.name} · {formatMegabytes(file.size)} MB
                    </p>
                )}

                {uploading && file && (
                    <div className="lecture-upload-progress">
                        <progress value={progress} max={100} aria-label={messages.transferProgress} />

                        <span role="status">
                            {progress === 100
                                ? messages.verifying
                                : messages.transferred(formatMegabytes((file.size * progress) / 100), formatMegabytes(file.size))}
                        </span>
                    </div>
                )}

                {error && (
                    <p className="lecture-upload-error" role="alert">
                        {error}
                    </p>
                )}

                {saved && (
                    <SavedMessage
                        saved={saved}
                        retrying={retry.isPending}
                        retryError={retry.error}
                        onRetry={retryStart}
                        onOpenLecture={onOpenLecture}
                    />
                )}

                <button
                    className="resources-toggle-btn"
                    type="submit"
                    disabled={uploading || !title.trim() || !description.trim() || !file}
                >
                    {submitLabel}
                </button>
            </form>
        </div>
    );
}

interface SavedMessageProps {
    saved: SavedRecording;
    retrying: boolean;
    retryError: Error | null;
    onRetry: () => void;
    onOpenLecture?: (lectureId: string) => void;
}

export function SavedMessage({ saved, retrying, retryError, onRetry, onOpenLecture }: SavedMessageProps) {
    const { language } = useTranslation();

    const messages = messagesByLanguage[language];

    const startFailed = saved.processing?.status === "failed";

    let message = messages.recordingSaved;

    if (saved.processing && !startFailed) {
        message = messages.processingStarted;
    }

    if (startFailed) {
        const reason = saved.processing?.error_code === "START_FAILED" ? "" : (saved.processing?.status_message ?? "");

        message = [messages.processingDidNotStart, language === "en" ? reason : "", messages.recordingSafe].filter(Boolean).join(" ");
    }

    return (
        <div className={startFailed ? "lecture-upload-warning" : "lecture-upload-success"} role="status">
            <p>{message}</p>

            {retryError && <p role="alert">{language === "en" ? retryErrorMessage(retryError) : messages.retryFailed}</p>}

            <div className="lecture-upload-result-actions">
                {startFailed && (
                    <button type="button" className="lecture-text-button" disabled={retrying} onClick={onRetry}>
                        {retrying ? messages.starting : messages.retryProcessing}
                    </button>
                )}

                {onOpenLecture && (
                    <button type="button" className="lecture-text-button" onClick={() => onOpenLecture(saved.lectureId)}>
                        {messages.openLecture}
                    </button>
                )}
            </div>
        </div>
    );
}
