import type { Lecture, LectureStatus as Status } from "../../api/lectures/types";
import { CheckCircleIcon, CircleNotchIcon, ClockIcon, FileAudioIcon, WarningCircleIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

export const statusLabelByStatus: Record<Status, string> = {
    pending: "Awaiting recording",
    uploaded: "Recording only",
    processing: "Processing",
    ready: "Ready",
    failed: "Processing stopped",
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

export function availabilitySummary(lecture: Lecture) {
    const kinds = new Set(lecture.generatedContent.map((item) => item.id));
    const parts = [
        lecture.transcript ? "Transcript" : undefined,
        kinds.has("summary") ? "Summary" : undefined,
        kinds.has("key_terms") ? "Key terms" : undefined,
    ].filter(Boolean);

    if (lecture.status === "pending") {
        return "No recording yet";
    }

    return parts.length > 0 ? `Recording · ${parts.join(" · ")}` : "Recording";
}

export default function LectureStatus({ status }: LectureStatusProps) {
    const StatusIcon = statusIconByStatus[status];

    return (
        <span className={`lecture-status lecture-status-${status}`}>
            <StatusIcon size={16} aria-hidden />
            {statusLabelByStatus[status]}
        </span>
    );
}
