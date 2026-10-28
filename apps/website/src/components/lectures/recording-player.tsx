import { useAuth } from "../../api/auth/provider";
import { recordingAccess } from "../../api/lectures/recording-access";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";

export default function RecordingPlayer({ courseId, lectureId }: { courseId: string; lectureId: string }) {
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

    const resumeAt = useRef(0);
    const resumePlaying = useRef(false);

    function refreshMedia(media?: HTMLMediaElement) {
        if (media) {
            resumeAt.current = media.currentTime;
            resumePlaying.current = !media.paused;
        }

        void refetch();
    }

    function restorePosition(media: HTMLMediaElement) {
        media.currentTime = resumeAt.current;

        if (resumePlaying.current) {
            void media.play().catch(() => setMediaFailed(true));
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

    function mediaError(media: HTMLMediaElement) {
        if (!mediaFailed) {
            setMediaFailed(true);
            refreshMedia(media);
        }
    }

    return (
        <section className="lecture-recording" aria-label="Recording">
            <h2>Recording</h2>
            {data && !recording.isError ? (
                <>
                    {data.contentType.startsWith("video/") ? (
                        <video
                            controls
                            preload="metadata"
                            src={data.url}
                            onTimeUpdate={(event) => {
                                resumeAt.current = event.currentTarget.currentTime;
                            }}
                            onError={(event) => mediaError(event.currentTarget)}
                            onLoadedMetadata={(event) => restorePosition(event.currentTarget)}
                            aria-label="Lecture recording"
                        />
                    ) : (
                        <audio
                            controls
                            preload="metadata"
                            src={data.url}
                            onTimeUpdate={(event) => {
                                resumeAt.current = event.currentTarget.currentTime;
                            }}
                            onError={(event) => mediaError(event.currentTarget)}
                            onLoadedMetadata={(event) => restorePosition(event.currentTarget)}
                            aria-label="Lecture recording"
                        />
                    )}
                    <button type="button" onClick={() => void downloadRecording()}>
                        Download recording
                    </button>
                </>
            ) : (
                <p>{recording.isError ? "Recording access could not be loaded." : "Loading recording…"}</p>
            )}
            {(recording.isError || mediaFailed) && (
                <button
                    type="button"
                    onClick={() => {
                        setMediaFailed(false);
                        void refetch();
                    }}
                >
                    Refresh recording access
                </button>
            )}
        </section>
    );
}
