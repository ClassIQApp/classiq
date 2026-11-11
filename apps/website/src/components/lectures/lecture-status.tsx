import type { Lecture, LectureStatus as Status } from "../../api/lectures/types";
import { useTranslation } from "../../i18n/use-translation";
import type { InterfaceLanguage } from "../../pages/settings/language-preferences";
import { CheckCircleIcon, CircleNotchIcon, ClockIcon, FileAudioIcon, WarningCircleIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

export const statusLabelByStatus: Record<Status, string> = {
    pending: "Awaiting recording",
    uploaded: "Recording only",
    processing: "Processing",
    ready: "Ready",
    failed: "Processing stopped",
};

interface LectureStatusMessages {
    status: Record<Status, string>;
    recording: string;
    noRecording: string;
    transcript: string;
    summary: string;
    keyTerms: string;
}

const messagesByLanguage: Record<InterfaceLanguage, LectureStatusMessages> = {
    en: {
        status: {
            pending: "Awaiting recording",
            uploaded: "Recording only",
            processing: "Processing",
            ready: "Ready",
            failed: "Processing stopped",
        },
        recording: "Recording",
        noRecording: "No recording yet",
        transcript: "Transcript",
        summary: "Summary",
        keyTerms: "Key terms",
    },

    es: {
        status: {
            pending: "Esperando grabación",
            uploaded: "Solo grabación",
            processing: "Procesando",
            ready: "Listo",
            failed: "Procesamiento detenido",
        },
        recording: "Grabación",
        noRecording: "Aún no hay grabación",
        transcript: "Transcripción",
        summary: "Resumen",
        keyTerms: "Términos clave",
    },

    ar: {
        status: {
            pending: "بانتظار التسجيل",
            uploaded: "التسجيل فقط",
            processing: "قيد المعالجة",
            ready: "جاهزة",
            failed: "توقفت المعالجة",
        },
        recording: "التسجيل",
        noRecording: "لا يوجد تسجيل بعد",
        transcript: "النص",
        summary: "الملخص",
        keyTerms: "المصطلحات الرئيسية",
    },

    de: {
        status: {
            pending: "Aufnahme ausstehend",
            uploaded: "Nur Aufnahme",
            processing: "In Bearbeitung",
            ready: "Bereit",
            failed: "Verarbeitung gestoppt",
        },
        recording: "Aufnahme",
        noRecording: "Noch keine Aufnahme",
        transcript: "Transkript",
        summary: "Zusammenfassung",
        keyTerms: "Schlüsselbegriffe",
    },

    fr: {
        status: {
            pending: "En attente d’un enregistrement",
            uploaded: "Enregistrement uniquement",
            processing: "En traitement",
            ready: "Prêt",
            failed: "Traitement arrêté",
        },
        recording: "Enregistrement",
        noRecording: "Aucun enregistrement pour le moment",
        transcript: "Transcription",
        summary: "Résumé",
        keyTerms: "Termes clés",
    },
};

const statusIconByStatus: Record<Status, Icon> = {
    pending: ClockIcon,
    uploaded: FileAudioIcon,
    processing: CircleNotchIcon,
    ready: CheckCircleIcon,
    failed: WarningCircleIcon,
};

interface LectureStatusProps {
    status: Status;
}

export function availabilitySummary(lecture: Lecture, language: InterfaceLanguage = "en") {
    const messages = messagesByLanguage[language];

    const kinds = new Set(lecture.generatedContent.map((item) => item.id));

    const parts = [
        lecture.transcript ? messages.transcript : undefined,

        kinds.has("summary") ? messages.summary : undefined,

        kinds.has("key_terms") ? messages.keyTerms : undefined,
    ].filter(Boolean);

    if (lecture.status === "pending") {
        return messages.noRecording;
    }

    return parts.length > 0 ? `${messages.recording} · ${parts.join(" · ")}` : messages.recording;
}

export default function LectureStatus({ status }: LectureStatusProps) {
    const { language } = useTranslation();

    const messages = messagesByLanguage[language];

    const StatusIcon = statusIconByStatus[status];

    return (
        <span className={`lecture-status lecture-status-${status}`}>
            <StatusIcon size={16} aria-hidden />

            {messages.status[status]}
        </span>
    );
}
