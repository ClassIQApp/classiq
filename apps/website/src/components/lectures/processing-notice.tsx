import { ApiError } from "../../api/auth/client";
import type { CourseRole } from "../../api/courses/types";
import { displayError } from "../../api/lectures/processing";
import type { LectureProcessing, ProcessingStage, ProcessingStageName } from "../../api/lectures/processing";
import type { LectureStatus } from "../../api/lectures/types";
import { CheckCircleIcon, CircleNotchIcon, ClockIcon, WarningCircleIcon, WifiSlashIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

const stageLabelByStage: Record<ProcessingStageName, string> = {
    verification: "Checking recording",
    normalization: "Preparing audio",
    transcription: "Transcribing",
    translation: "Spanish translation",
    summary: "Summary",
    key_terms: "Key terms",
};

const stageStatusLabel: Record<ProcessingStage["status"], string> = {
    pending: "Waiting",
    running: "In progress",
    succeeded: "Done",
    failed: "Didn't finish",
};

const stageIconByStatus: Record<ProcessingStage["status"], Icon> = {
    pending: ClockIcon,
    running: CircleNotchIcon,
    succeeded: CheckCircleIcon,
    failed: WarningCircleIcon,
};

const announcementByStatus: Record<LectureStatus, string> = {
    pending: "Waiting for the recording upload.",
    uploaded: "Recording saved. Processing has not started.",
    processing: "Preparing study materials.",
    ready: "Study materials are ready.",
    failed: "Processing stopped.",
};

interface ProcessingNoticeProps {
    processing: LectureProcessing | undefined;
    fallbackStatus: LectureStatus;
    statusError: Error | null;
    refreshingStatus: boolean;
    role: CourseRole;
    retrying: boolean;
    retryError: Error | null;
    onRetry: () => void;
    onRefreshStatus: () => void;
}

interface NoticeContent {
    tone: "neutral" | "info" | "warning" | "danger";
    icon: Icon;
    title: string;
    body: string;
    action?: ReactNode;
    details?: boolean;
}

interface StatusErrorProps {
    error: Error;
    hasStatus: boolean;
    refreshing: boolean;
    onRefresh: () => void;
}

interface StageDetailsProps {
    processing: LectureProcessing;
}

export function retryErrorMessage(error: Error) {
    if (error instanceof ApiError && error.code === "RECORDING_REQUIRED") {
        return "Upload the recording before starting processing.";
    }

    return displayError(error);
}

function transcriptionProgress(processing: LectureProcessing) {
    const transcription = processing.stages.find((stage) => stage.stage === "transcription");
    const { total, collected } = processing.chunks;

    if (transcription?.status !== "running" || total <= 0) {
        return undefined;
    }

    return `${Math.min(collected, total)} of ${total} audio ${total === 1 ? "section" : "sections"} transcribed`;
}

function StageDetails({ processing }: StageDetailsProps) {
    return (
        <details className="lecture-processing-details">
            <summary>Show steps</summary>
            <ol className="lecture-processing-stages">
                {processing.stages.map((stage) => {
                    const StageIcon = stageIconByStatus[stage.status];

                    return (
                        <li key={stage.stage} className={`lecture-processing-stage lecture-processing-stage-${stage.status}`}>
                            <StageIcon size={16} weight={stage.status === "succeeded" ? "fill" : "regular"} aria-hidden />
                            <span>{stageLabelByStage[stage.stage]}</span>
                            <span className="lecture-processing-stage-status">
                                {stageStatusLabel[stage.status]}
                                {stage.status === "failed" && stage.statusMessage && stage.statusMessage !== processing.statusMessage
                                    ? ` · ${stage.statusMessage}`
                                    : ""}
                            </span>
                        </li>
                    );
                })}
            </ol>
        </details>
    );
}

function StatusError({ error, hasStatus, refreshing, onRefresh }: StatusErrorProps) {
    const unavailable = error instanceof ApiError && error.status === 503;
    let message = `Couldn't load the processing status. ${displayError(error)}`;

    if (hasStatus) {
        message = "Couldn't refresh the processing status. Showing the last known state.";
    }

    if (unavailable) {
        message = `${hasStatus ? "Status updates are" : "The processing status is"} temporarily unavailable. ${displayError(error)}`;
    }

    return (
        <p className="lecture-status-error">
            <WifiSlashIcon size={16} aria-hidden />
            <span>{message}</span>
            <button type="button" className="lecture-text-button" disabled={refreshing} onClick={onRefresh}>
                {refreshing ? "Checking…" : "Try again"}
            </button>
        </p>
    );
}

export default function ProcessingNotice({
    processing,
    fallbackStatus,
    statusError,
    refreshingStatus,
    role,
    retrying,
    retryError,
    onRetry,
    onRefreshStatus,
}: ProcessingNoticeProps) {
    const status = processing?.status ?? fallbackStatus;
    const teacher = role === "teacher";

    function retryButton(label: string) {
        return (
            <button type="button" className="lecture-notice-action" disabled={retrying} onClick={onRetry}>
                {retrying ? "Starting…" : label}
            </button>
        );
    }

    const contentByStatus: Record<LectureStatus, NoticeContent | null> = {
        pending: {
            tone: "neutral",
            icon: ClockIcon,
            title: "No recording yet",
            body: teacher
                ? "Upload this lecture's recording from the lecture list. Study materials are prepared after the upload."
                : "Your instructor hasn't uploaded this recording yet.",
        },
        uploaded: {
            tone: "warning",
            icon: ClockIcon,
            title: "Recording saved",
            body: teacher
                ? "Processing hasn't started. The recording is safe. Start processing to create the transcript and study materials. No re-upload needed."
                : "Study materials haven't been prepared yet. You can play the recording now.",
            action: teacher ? retryButton("Start processing") : undefined,
        },
        processing: {
            tone: "info",
            icon: CircleNotchIcon,
            title: "Preparing study materials",
            body: [
                "You can play the recording now. The transcript, summary and key terms appear below as they're ready.",
                processing ? transcriptionProgress(processing) : undefined,
            ]
                .filter(Boolean)
                .join(" "),
            details: true,
        },
        ready: null,
        failed: {
            tone: "danger",
            icon: WarningCircleIcon,
            title: "Processing stopped",
            body: `${processing?.statusMessage || "Some study materials couldn't be prepared."} Anything already saved is still available${teacher ? "." : ". Your instructor can retry processing."}`,
            action: teacher ? retryButton("Retry processing") : undefined,
            details: true,
        },
    };
    const content = contentByStatus[status];
    const NoticeIcon = content?.icon;

    return (
        <>
            <p className="lecture-sr-only" role="status" aria-live="polite">
                {processing ? announcementByStatus[processing.status] : ""}
            </p>
            {content && NoticeIcon && (
                <div className={`lecture-notice lecture-notice-${content.tone}`}>
                    <NoticeIcon
                        className={status === "processing" ? "lecture-notice-icon lecture-spin" : "lecture-notice-icon"}
                        size={20}
                        aria-hidden
                    />
                    <div className="lecture-notice-body">
                        <strong>{content.title}</strong>
                        <p>{content.body}</p>
                        {retryError && (
                            <p className="lecture-notice-error" role="alert">
                                {retryErrorMessage(retryError)}
                            </p>
                        )}
                        {content.details && processing && processing.run && <StageDetails processing={processing} />}
                    </div>
                    {content.action}
                </div>
            )}
            {statusError && (
                <StatusError error={statusError} hasStatus={!!processing} refreshing={refreshingStatus} onRefresh={onRefreshStatus} />
            )}
        </>
    );
}
