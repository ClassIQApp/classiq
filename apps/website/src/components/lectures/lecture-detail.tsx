import { useAuth } from "../../api/auth/provider";
import type { CourseRole } from "../../api/courses/types";
import type { Lecture } from "../../api/lectures/types";
import { useLectureContent, useLectureProcessing, useRefreshOnProcessingChange, useRetryProcessing } from "../../api/lectures/use-lecture";
import LectureEditForm from "./lecture-edit-form";
import { KeyTermsSection, OutputPlaceholder, Provenance, SummarySection } from "./lecture-materials";
import LectureResources from "./lecture-resources";
import LectureStatus from "./lecture-status";
import ProcessingNotice from "./processing-notice";
import RecordingPlayer from "./recording-player";
import type { SeekRequest } from "./recording-player";
import TranscriptView from "./transcript-view";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useCallback, useRef, useState } from "react";

interface LectureDetailProps {
    courseId: string;
    lecture: Lecture;
    role: CourseRole;
    startSeconds?: number;
    onBack: () => void;
}

export default function LectureDetail({ courseId, lecture, role, startSeconds, onBack }: LectureDetailProps) {
    const { state } = useAuth();
    const processing = useLectureProcessing(courseId, lecture.id);
    const content = useLectureContent(courseId, lecture.id);
    const retry = useRetryProcessing(courseId);
    const player = useRef<HTMLDivElement>(null);
    const seekCount = useRef(0);
    const [seek, setSeek] = useState<SeekRequest | undefined>(
        startSeconds === undefined ? undefined : { seconds: startSeconds, id: 0, play: false },
    );
    const [playhead, setPlayhead] = useState(-1);

    useRefreshOnProcessingChange(courseId, lecture.id, processing.data);

    const status = processing.data?.status ?? lecture.status;
    const hasRecording = status !== "pending";
    const context = { processing: processing.data, fallbackStatus: lecture.status, role };

    const seekTo = useCallback((seconds: number) => {
        seekCount.current += 1;
        setSeek({ seconds, id: seekCount.current, play: true });
        setPlayhead(Math.floor(seconds));
        player.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, []);

    const resources = state.status === "authenticated" && (
        <LectureResources accountId={state.user.id} courseId={courseId} lectureId={lecture.id} legacyLinks={lecture.resources} />
    );

    return (
        <div className="lecture-detail">
            <div className="lecture-detail-top">
                <button type="button" className="lecture-text-button" onClick={onBack}>
                    <ArrowLeftIcon size={18} aria-hidden /> Back to lectures
                </button>
                <LectureStatus status={status} />
            </div>
            {role === "teacher" && <LectureEditForm key={`${courseId}:${lecture.id}`} courseId={courseId} lecture={lecture} />}
            <ProcessingNotice
                processing={processing.data}
                fallbackStatus={lecture.status}
                statusError={processing.error}
                refreshingStatus={processing.isFetching}
                role={role}
                retrying={retry.isPending}
                retryError={retry.error}
                onRetry={() => retry.mutate(lecture.id)}
                onRefreshStatus={() => void processing.refetch()}
            />
            {hasRecording ? (
                <div className="lecture-layout">
                    <div className="lecture-main">
                        <div ref={player} className="lecture-player-slot">
                            <RecordingPlayer
                                courseId={courseId}
                                lectureId={lecture.id}
                                seek={seek}
                                onTimeChange={(seconds) => setPlayhead(Math.floor(seconds))}
                            />
                        </div>
                        <section className="lecture-card lecture-transcript-card" aria-labelledby="lecture-transcript-heading">
                            <h2 id="lecture-transcript-heading">Transcript</h2>
                            {content.transcript.data ? (
                                <TranscriptView
                                    transcript={content.transcript.data}
                                    spanish={content.spanish.data}
                                    spanishLoading={content.spanish.isFetching}
                                    playhead={playhead}
                                    onSeek={seekTo}
                                />
                            ) : (
                                <OutputPlaceholder output="transcript" query={content.transcript} {...context} />
                            )}
                            <Provenance content={content} />
                        </section>
                    </div>
                    <aside className="lecture-aside" aria-label="Lecture materials">
                        <SummarySection content={content} {...context} />
                        <KeyTermsSection content={content} onSeek={seekTo} {...context} />
                        {resources}
                    </aside>
                </div>
            ) : (
                resources
            )}
        </div>
    );
}
