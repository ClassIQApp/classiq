import { PlayIcon } from "@phosphor-icons/react";

export function formatTimestamp(totalSeconds: number) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = String(seconds % 60).padStart(2, "0");

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${remainder}`;
    }

    return `${minutes}:${remainder}`;
}

interface TimestampButtonProps {
    seconds: number;
    onSeek: (seconds: number) => void;
}

export function TimestampButton({ seconds, onSeek }: TimestampButtonProps) {
    const time = formatTimestamp(seconds);

    return (
        <button type="button" className="lecture-timestamp" aria-label={`Play recording from ${time}`} onClick={() => onSeek(seconds)}>
            <PlayIcon size={12} weight="fill" aria-hidden />
            {time}
        </button>
    );
}
