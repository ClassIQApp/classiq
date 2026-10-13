import type { LectureStatus as Status } from "../../api/lectures/types";
import { CheckCircleIcon, ClockIcon, WarningCircleIcon } from "@phosphor-icons/react";

const statusLabelByStatus: Record<Status, string> = {
    ready: "Ready",
    processing: "Processing",
    failed: "Failed",
};

export default function LectureStatus({ status }: { status: Status }) {
    const Icon = status === "ready" ? CheckCircleIcon : status === "processing" ? ClockIcon : WarningCircleIcon;

    return (
        <span className={`lecture-status lecture-status-${status}`}>
            <Icon size={16} aria-hidden />

            {statusLabelByStatus[status]}
        </span>
    );
}
