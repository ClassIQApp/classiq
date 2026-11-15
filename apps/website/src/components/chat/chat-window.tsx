import { useAuth } from "../../api/auth/provider";
import type { Lecture } from "../../api/lectures/types";
import type { AnswerSource } from "../../api/questions/client";
import { createQuestionsApi } from "../../api/questions/client";
import { createResourcesApi } from "../../api/resources/client";
import { openInNewTab } from "../courses/open-in-new-tab";
import { formatTimestamp } from "../lectures/timestamp";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

const MAX_QUESTION_LENGTH = 1000;

interface ChatMessage {
    id: number;
    role: "user" | "assistant";
    text: string;
    sources?: AnswerSource[];
    failed?: boolean;
}

interface ChatWindowProps {
    courseId: string;
    lectures: Lecture[];
    onOpenLecture: (lectureId: string, startSeconds?: number) => void;
}

export default function ChatWindow({ courseId, lectures, onOpenLecture }: ChatWindowProps) {
    const { apiFetch } = useAuth();
    const questions = useMemo(() => createQuestionsApi(apiFetch), [apiFetch]);
    const resources = useMemo(() => createResourcesApi(apiFetch), [apiFetch]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [question, setQuestion] = useState("");
    const [lectureId, setLectureId] = useState("");
    const [asking, setAsking] = useState(false);
    const [notice, setNotice] = useState("");
    const lifetime = useRef(new AbortController());
    const nextId = useRef(1);
    const end = useRef<HTMLDivElement>(null);

    useEffect(() => {
        lifetime.current = new AbortController();

        return () => lifetime.current.abort();
    }, []);

    useEffect(() => {
        end.current?.scrollIntoView?.({ block: "end" });
    }, [messages]);

    function add(message: Omit<ChatMessage, "id">) {
        setMessages((current) => [...current, { ...message, id: nextId.current++ }]);
    }

    async function submit(event?: FormEvent) {
        event?.preventDefault();

        const text = question.trim();

        if (!text || asking) {
            return;
        }

        const signal = lifetime.current.signal;

        setQuestion("");
        setNotice("");
        setAsking(true);
        add({ role: "user", text });

        try {
            const answer = await questions.ask(courseId, text, lectureId || undefined, signal);

            if (!signal.aborted) {
                add({ role: "assistant", text: answer.answer, sources: answer.sources });
            }
        } catch (error) {
            if (!signal.aborted) {
                add({
                    role: "assistant",
                    text: error instanceof Error ? error.message : "The question could not be answered.",
                    failed: true,
                });
            }
        } finally {
            if (!signal.aborted) {
                setAsking(false);
            }
        }
    }

    function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void submit();
        }
    }

    async function openSource(source: AnswerSource) {
        const signal = lifetime.current.signal;

        if (source.kind === "transcript" && source.lectureId) {
            onOpenLecture(source.lectureId, source.startSeconds);

            return;
        }

        if (!source.resourceId) {
            return;
        }

        const resourceId = source.resourceId;

        try {
            const outcome = await openInNewTab(async () => {
                const url = await resources.download(courseId, resourceId, signal);

                return source.pageNumber === undefined ? url : `${url}#page=${source.pageNumber}`;
            }, signal);

            if (outcome === "blocked") {
                setNotice("Your browser blocked the PDF. Allow pop-ups and try again.");
            }
        } catch {
            if (!signal.aborted) {
                setNotice("The PDF could not be opened.");
            }
        }
    }

    function describe(source: AnswerSource) {
        const lecture = lectures.find((item) => item.id === source.lectureId);
        const place =
            source.pageNumber === undefined
                ? source.startSeconds === undefined
                    ? ""
                    : formatTimestamp(source.startSeconds)
                : `page ${source.pageNumber}`;
        const name = source.kind === "transcript" ? (lecture?.title ?? source.title) : source.title;

        return place ? `${name}, ${place}` : name;
    }

    return (
        <section className="chat-window-box" aria-label="Ask about this course">
            <div className="chat-window-messages" role="log" aria-live="polite">
                {messages.length === 0 ? (
                    <p className="chat-window-empty">
                        Ask a question about this course. Answers come from its lectures and PDFs, with the passages they rely on.
                    </p>
                ) : null}
                {messages.map((message) => (
                    <div key={message.id} className={message.role === "user" ? "chat-message-box-user" : "chat-message-box-ai"}>
                        <p>{message.text}</p>
                        {message.sources && message.sources.length > 0 ? (
                            <ul className="chat-message-sources" aria-label="Sources">
                                {message.sources.map((source, index) => (
                                    <li
                                        key={`${source.lectureId ?? source.resourceId}-${source.startSeconds ?? source.pageNumber}-${index}`}
                                    >
                                        <button type="button" className="resources-view-btn" onClick={() => void openSource(source)}>
                                            {describe(source)}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                ))}
                {asking ? <div className="chat-message-box-ai">Looking through the course…</div> : null}
                <div ref={end} />
            </div>
            {notice ? (
                <p role="alert" className="chat-window-notice">
                    {notice}
                </p>
            ) : null}
            <form className="chat-window-fields" onSubmit={(event) => void submit(event)}>
                <label>
                    Question
                    <textarea
                        value={question}
                        maxLength={MAX_QUESTION_LENGTH}
                        placeholder="Ask about this course"
                        readOnly={asking}
                        onChange={(event) => setQuestion(event.target.value)}
                        onKeyDown={onKeyDown}
                    />
                </label>
                <label>
                    Search in
                    <select value={lectureId} onChange={(event) => setLectureId(event.target.value)}>
                        <option value="">Whole course</option>
                        {lectures.map((lecture) => (
                            <option key={lecture.id} value={lecture.id}>
                                {lecture.title}
                            </option>
                        ))}
                    </select>
                </label>
            </form>
        </section>
    );
}
