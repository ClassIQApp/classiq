import type { TranscriptSegment } from "../../api/lectures/content";
import { captionVtt } from "./caption-vtt";
import { useEffect, useRef, useState } from "react";

interface CaptionTrackProps {
    segments: readonly TranscriptSegment[];
    language: string;
    label: string;
    kind: "captions" | "subtitles";
    showByDefault?: boolean;
}

export default function CaptionTrack({ segments, language, label, kind, showByDefault = false }: CaptionTrackProps) {
    const [url, setUrl] = useState<string>();
    const trackElement = useRef<HTMLTrackElement | null>(null);

    useEffect(() => {
        const source = URL.createObjectURL(
            new Blob([captionVtt(segments)], {
                type: "text/vtt",
            }),
        );

        setUrl(source);

        return () => {
            URL.revokeObjectURL(source);
        };
    }, [segments]);

    useEffect(() => {
        const element = trackElement.current;

        if (!element || !showByDefault) {
            return;
        }

        element.track.mode = "showing";
    }, [url, showByDefault]);

    if (!url) {
        return null;
    }

    return <track ref={trackElement} kind={kind} src={url} srcLang={language} label={label} default={showByDefault} />;
}
