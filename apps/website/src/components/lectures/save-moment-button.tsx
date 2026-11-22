import { formatTimestamp } from "./timestamp";
import { BookmarkSimpleIcon } from "@phosphor-icons/react";

interface SaveMomentButtonProps {
    seconds: number;
    pending: boolean;
    onSave: (seconds: number) => void;
}

export function SaveMomentButton({ seconds, pending, onSave }: SaveMomentButtonProps) {
    const time = formatTimestamp(seconds);

    return (
        <button type="button" className="moment-save-button" disabled={pending} onClick={() => onSave(seconds)}>
            <BookmarkSimpleIcon size={16} aria-hidden />
            Save moment at {time}
        </button>
    );
}

interface ParagraphBookmarkButtonProps {
    seconds: number;
    onSave: (seconds: number) => void;
}

export function ParagraphBookmarkButton({ seconds, onSave }: ParagraphBookmarkButtonProps) {
    const time = formatTimestamp(seconds);

    return (
        <button
            type="button"
            className="moment-paragraph-button"
            aria-label={`Save moment at ${time}`}
            title={`Save moment at ${time}`}
            onClick={() => onSave(seconds)}
        >
            <BookmarkSimpleIcon size={16} aria-hidden />
        </button>
    );
}
