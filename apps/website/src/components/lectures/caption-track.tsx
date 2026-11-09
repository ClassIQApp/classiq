import type { TranscriptSegment } from "../../api/lectures/content";
import { captionVtt } from "./caption-vtt";
import { useEffect, useState } from "react";

interface CaptionTrackProps {
    segments: readonly TranscriptSegment[];
    language: string;
    label: string;
    kind: "captions" | "subtitles";
}

export default function CaptionTrack({ segments, language, label, kind }: CaptionTrackProps) {
    const [url, setUrl] = useState<string>();

    useEffect(() => {
        const source = URL.createObjectURL(new Blob([captionVtt(segments)], { type: "text/vtt" }));
        setUrl(source);

        return () => URL.revokeObjectURL(source);
    }, [segments]);

    return url ? <track kind={kind} src={url} srcLang={language} label={label} /> : null;
}
