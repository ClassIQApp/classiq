import { useAuth } from "../../api/auth/provider";
import type { ChatSource } from "../../api/chat/client";
import { chatQueryKey, createChatApi } from "../../api/chat/client";
import type { CourseRole } from "../../api/courses/types";
import type { Lecture } from "../../api/lectures/types";
import { createResourcesApi } from "../../api/resources/client";
import { openInNewTab } from "../courses/open-in-new-tab";
import ChatMessageRow from "./chat-message";
import { CaretDownIcon, CaretUpIcon, ChatCircleDotsIcon, PaperPlaneRightIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

const MAX_MESSAGE_LENGTH = 2000;
const POLL_INTERVAL_MS = 4000;

interface ChatWidgetProps {
    courseId: string;
    role: CourseRole;
    lectures: Lecture[];
    activeLectureId?: string;
    onOpenLecture: (lectureId: string, startSeconds?: number) => void;
}

export default function ChatWidget(props: ChatWidgetProps) {
    const { state } = useAuth();

    if (state.status !== "authenticated") {
        return null;
    }

    return <ChatPanel key={`${state.user.id}:${props.courseId}`} {...props} accountId={state.user.id} />;
}

interface ChatPanelProps extends ChatWidgetProps {
    accountId: string;
}

function ChatPanel({ accountId, courseId, role, lectures, activeLectureId, onOpenLecture }: ChatPanelProps) {
    const { apiFetch } = useAuth();
    const api = useMemo(() => createChatApi(apiFetch), [apiFetch]);
    const resources = useMemo(() => createResourcesApi(apiFetch), [apiFetch]);
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [room, setRoom] = useState(activeLectureId ?? "");
    const [draft, setDraft] = useState("");
    const [notice, setNotice] = useState("");
    const log = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLTextAreaElement>(null);
    const lifetime = useRef(new AbortController());
    const roomKey = chatQueryKey(accountId, courseId, room);

    useEffect(() => {
        lifetime.current = new AbortController();

        return () => lifetime.current.abort();
    }, []);

    const messages = useQuery({
        queryKey: roomKey,
        queryFn: ({ signal }) => api.list(courseId, room || undefined, signal),
        enabled: open,
        refetchInterval: POLL_INTERVAL_MS,
    });

    const send = useMutation({
        mutationFn: (body: string) => api.post(courseId, body, room || undefined),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: roomKey }),
        onError: (error) => setNotice(error instanceof Error ? error.message : "The message could not be sent."),
    });

    const remove = useMutation({
        mutationFn: (messageId: string) => api.remove(courseId, messageId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: roomKey }),
        onError: () => setNotice("The message could not be deleted."),
    });

    const items = messages.data ?? [];

    useEffect(() => {
        if (log.current) {
            log.current.scrollTop = log.current.scrollHeight;
        }
    }, [items.length, open, room, send.isPending]);

    useEffect(() => {
        if (open) {
            input.current?.focus();
        }
    }, [open]);

    function submit(event?: FormEvent) {
        event?.preventDefault();

        const body = draft.trim();

        if (!body || send.isPending) {
            return;
        }

        setDraft("");
        setNotice("");
        send.mutate(body);
    }

    function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
        }
    }

    async function openSource(source: ChatSource) {
        const signal = lifetime.current.signal;

        if (source.kind === "transcript" && source.lectureId) {
            onOpenLecture(source.lectureId, source.startSeconds);

            return;
        }

        const resourceId = source.resourceId;

        if (!resourceId) {
            return;
        }

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

    return (
        <section className="chat-widget" aria-label="Course chat">
            <button
                type="button"
                className="chat-widget-header"
                aria-expanded={open}
                aria-controls="chat-widget-body"
                onClick={() => setOpen(!open)}
            >
                <ChatCircleDotsIcon aria-hidden="true" weight="fill" />
                <span>Course chat</span>
                {open ? <CaretDownIcon aria-hidden="true" /> : <CaretUpIcon aria-hidden="true" />}
            </button>
            <div id="chat-widget-body" className="chat-widget-body" hidden={!open}>
                <select className="chat-widget-room" aria-label="Chat room" value={room} onChange={(event) => setRoom(event.target.value)}>
                    <option value="">Course room</option>
                    {lectures.map((lecture) => (
                        <option key={lecture.id} value={lecture.id}>
                            {lecture.title}
                        </option>
                    ))}
                </select>
                <div ref={log} className="chat-widget-messages" role="log" aria-live="polite">
                    {messages.isError && items.length === 0 ? (
                        <p className="chat-widget-notice">The chat could not be loaded. Retrying…</p>
                    ) : null}
                    {items.length === 0 && !messages.isError && !messages.isPending ? (
                        <p className="chat-widget-empty">
                            No messages yet. Say hello, or ask a question and the AI assistant will answer from the course material.
                        </p>
                    ) : null}
                    {items.map((message) => (
                        <ChatMessageRow
                            key={message.id}
                            message={message}
                            isYou={message.author.id !== undefined && message.author.id === accountId}
                            canDelete={role === "teacher" || (message.author.id !== undefined && message.author.id === accountId)}
                            lectures={lectures}
                            onOpenSource={(source) => void openSource(source)}
                            onDelete={() => remove.mutate(message.id)}
                        />
                    ))}
                    {send.isPending ? <p className="chat-widget-sending">Sending: {send.variables}</p> : null}
                </div>
                {notice ? (
                    <p role="alert" className="chat-widget-notice">
                        {notice}
                    </p>
                ) : null}
                <form className="chat-widget-compose" onSubmit={submit}>
                    <textarea
                        ref={input}
                        rows={2}
                        aria-label="Message"
                        value={draft}
                        maxLength={MAX_MESSAGE_LENGTH}
                        placeholder={room ? "Message this lecture's room" : "Message the course"}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={onKeyDown}
                    />
                    <button
                        type="submit"
                        className="chat-widget-send"
                        aria-label="Send message"
                        disabled={send.isPending || draft.trim() === ""}
                    >
                        <PaperPlaneRightIcon aria-hidden="true" weight="fill" />
                    </button>
                </form>
            </div>
        </section>
    );
}
