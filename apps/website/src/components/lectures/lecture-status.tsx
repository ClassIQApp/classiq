import type { LectureStatus as Status } from "../../api/lectures/types";
import { CheckCircleIcon, ClockIcon, WarningCircleIcon } from "@phosphor-icons/react";

const statusLabelByStatus: Record<Status, string> = {
    pending: "Awaiting upload",
    uploaded: "Uploaded",
    ready: "Ready",
    processing: "Processing",
    failed: "Failed",
};

const statusIconByStatus: Record<Status, typeof CheckCircleIcon> = {
    pending: ClockIcon,
    uploaded: CheckCircleIcon,
    ready: CheckCircleIcon,
    processing: ClockIcon,
    failed: WarningCircleIcon,
};

export default function LectureStatus({ status }: { status: Status }) {
    const Icon = statusIconByStatus[status];

    return (
        <span className={`lecture-status lecture-status-${status}`}>
            <Icon size={16} aria-hidden />

            {statusLabelByStatus[status]}
        </span>
    );
}
