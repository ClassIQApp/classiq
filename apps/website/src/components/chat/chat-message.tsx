import type { ChatMessage, ChatSource } from "../../api/chat/client";
import type { Lecture } from "../../api/lectures/types";
import { formatTimestamp } from "../lectures/timestamp";
import { AuthorCard, ChatAvatar, roleName } from "./chat-author";

const timeFormat = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" });

export function describeSource(source: ChatSource, lectures: Lecture[]) {
    const lecture = lectures.find((item) => item.id === source.lectureId);
    const name = source.kind === "transcript" ? (lecture?.title ?? source.title) : source.title;

    if (source.pageNumber !== undefined) {
        return `${name}, page ${source.pageNumber}`;
    }

    return source.startSeconds === undefined ? name : `${name}, ${formatTimestamp(source.startSeconds)}`;
}

interface ChatMessageRowProps {
    message: ChatMessage;
    lectures: Lecture[];
    isYou: boolean;
    canDelete: boolean;
    onOpenSource: (source: ChatSource) => void;
    onDelete: () => void;
}

export default function ChatMessageRow({ message, lectures, isYou, canDelete, onOpenSource, onDelete }: ChatMessageRowProps) {
    const { author } = message;

    return (
        <article className={`chat-message${author.role === "assistant" ? " chat-message-assistant" : ""}`}>
            <AuthorCard author={author} isYou={isYou}>
                <ChatAvatar author={author} />
            </AuthorCard>
            <div className="chat-message-main">
                <header className="chat-message-header">
                    <AuthorCard author={author} isYou={isYou}>
                        <span className="chat-message-name">{author.name}</span>
                    </AuthorCard>
                    {author.role === "member" ? null : <span className="chat-message-role">{roleName(author.role)}</span>}
                    <time dateTime={message.createdAt}>{timeFormat.format(new Date(message.createdAt))}</time>
                    {canDelete ? (
                        <button type="button" className="chat-message-delete" onClick={onDelete}>
                            Delete
                        </button>
                    ) : null}
                </header>
                <p className="chat-message-body">{message.body}</p>
                {message.sources.length > 0 ? (
                    <ul className="chat-message-sources" aria-label="Sources">
                        {message.sources.map((source, index) => (
                            <li key={`${source.lectureId ?? source.resourceId}-${source.startSeconds ?? source.pageNumber}-${index}`}>
                                <button type="button" className="resources-view-btn" onClick={() => onOpenSource(source)}>
                                    {describeSource(source, lectures)}
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : null}
            </div>
        </article>
    );
}
