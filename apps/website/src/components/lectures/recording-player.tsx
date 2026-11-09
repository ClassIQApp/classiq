import { useAuth } from "../../api/auth/provider";
import type { SpanishTranscript, Transcript } from "../../api/lectures/content";
import { recordingAccess } from "../../api/lectures/recording-access";
import CaptionTrack from "./caption-track";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

export interface SeekRequest {
    seconds: number;
    id: number;
    play: boolean;
}

interface RecordingPlayerProps {
    courseId: string;
    lectureId: string;
    seek?: SeekRequest;
    onTimeChange?: (seconds: number) => void;
    transcript?: Transcript | null;
    spanish?: SpanishTranscript | null;
}

const HAVE_METADATA = 1;

export default function RecordingPlayer({ courseId, lectureId, seek, onTimeChange, transcript, spanish }: RecordingPlayerProps) {
    const { state, apiFetch } = useAuth();
    const userId = state.status === "authenticated" ? state.user.id : undefined;
    const [mediaFailed, setMediaFailed] = useState(false);
    const recording = useQuery({
        queryKey: ["recording", userId, courseId, lectureId],
        enabled: !!userId && !!courseId,
        queryFn: ({ signal }) => recordingAccess(apiFetch, courseId, lectureId, signal),
        retry: false,
        staleTime: 0,
    });
    const { data, refetch } = recording;

    const media = useRef<HTMLMediaElement | null>(null);
    const resumeAt = useRef(seek?.seconds ?? 0);
    const resumePlaying = useRef(false);

    useEffect(() => {
        if (!seek) {
            return;
        }

        const element = media.current;

        if (!element || element.readyState < HAVE_METADATA) {
            resumeAt.current = seek.seconds;
            resumePlaying.current = seek.play;

            return;
        }

        element.currentTime = seek.seconds;

        if (seek.play) {
            void element.play().catch(() => undefined);
        }
    }, [seek]);

    function refreshMedia(element?: HTMLMediaElement) {
        // Before metadata loads the element still reports 0, which would overwrite a pending seek (e.g. from search).
        if (element && element.readyState >= HAVE_METADATA) {
            resumeAt.current = element.currentTime;
            resumePlaying.current = !element.paused;
        }

        void refetch();
    }

    function restorePosition(element: HTMLMediaElement) {
        element.currentTime = resumeAt.current;

        if (resumePlaying.current) {
            void element.play().catch(() => setMediaFailed(true));
        }
    }

    async function downloadRecording() {
        const tab = window.open("about:blank", "_blank");

        if (tab) {
            tab.opener = null;
        }

        try {
            const access = await recordingAccess(apiFetch, courseId, lectureId, new AbortController().signal);

            if (tab) {
                tab.location.href = access.url;
            } else {
                setMediaFailed(true);
            }
        } catch {
            tab?.close();
            setMediaFailed(true);
        }
    }

    function mediaError(element: HTMLMediaElement) {
        if (!mediaFailed) {
            setMediaFailed(true);
            refreshMedia(element);
        }
    }

    const mediaProps = {
        controls: true,
        preload: "metadata",
        src: data?.url,
        onTimeUpdate: (event: { currentTarget: HTMLMediaElement }) => {
            if (event.currentTarget.readyState < HAVE_METADATA) {
                return;
            }

            resumeAt.current = event.currentTarget.currentTime;
            onTimeChange?.(event.currentTarget.currentTime);
        },
        onError: (event: { currentTarget: HTMLMediaElement }) => mediaError(event.currentTarget),
        onLoadedMetadata: (event: { currentTarget: HTMLMediaElement }) => restorePosition(event.currentTarget),
        "aria-label": "Lecture recording",
    } as const;

    return (
        <section className="lecture-recording" aria-label="Recording">
            {data && !recording.isError ? (
                <>
                    {data.contentType.startsWith("video/") ? (
                        <video ref={(element) => void (media.current = element)} {...mediaProps} playsInline>
                            {transcript && transcript.segments.length > 0 && (
                                <CaptionTrack
                                    segments={transcript.segments}
                                    language={transcript.language}
                                    label={`Original (${transcript.language})`}
                                    kind="captions"
                                />
                            )}
                            {transcript?.translationStatus === "succeeded" && spanish && spanish.segments.length > 0 && (
                                <CaptionTrack segments={spanish.segments} language="es" label="Español" kind="subtitles" />
                            )}
                        </video>
                    ) : (
                        <audio ref={(element) => void (media.current = element)} {...mediaProps} />
                    )}
                    <div className="lecture-recording-actions">
                        <button type="button" className="lecture-text-button" onClick={() => void downloadRecording()}>
                            Download recording
                        </button>
                        {mediaFailed && (
                            <button
                                type="button"
                                className="lecture-text-button"
                                onClick={() => {
                                    setMediaFailed(false);
                                    void refetch();
                                }}
                            >
                                Refresh recording access
                            </button>
                        )}
                    </div>
                </>
            ) : (
                <div className="lecture-recording-placeholder">
                    <p>{recording.isError ? "The recording couldn't be loaded." : "Loading recording…"}</p>
                    {recording.isError && (
                        <button type="button" className="lecture-text-button" onClick={() => void refetch()}>
                            Try again
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}
