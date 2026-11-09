import type { TranscriptSegment } from "../../api/lectures/content";

function timestamp(milliseconds: number) {
    const hours = Math.floor(milliseconds / 3_600_000);
    const minutes = Math.floor(milliseconds / 60_000) % 60;
    const seconds = Math.floor(milliseconds / 1000) % 60;

    return `${[hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":")}.${String(milliseconds % 1000).padStart(3, "0")}`;
}

export function captionVtt(segments: readonly TranscriptSegment[]): string {
    const cues: string[] = [];

    for (const segment of segments) {
        const start = Math.round(segment.startSeconds * 1000);
        const end = Math.round(segment.endSeconds * 1000);
        const text = segment.text.trim().replaceAll(/\s+/g, " ");

        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || !text) {
            continue;
        }

        // WebVTT interprets tags and entities, so transcript text must be escaped.
        const escapedText = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

        cues.push(`${timestamp(start)} --> ${timestamp(end)}\n${escapedText}`);
    }

    return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}
