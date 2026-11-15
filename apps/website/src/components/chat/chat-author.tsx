import type { ChatAuthor } from "../../api/chat/client";
import { useId, useState } from "react";
import type { ReactNode } from "react";

const roleLabel: Record<ChatAuthor["role"], string> = {
    teacher: "Teacher",
    member: "Member",
    assistant: "AI assistant",
};

const roleDescription: Record<ChatAuthor["role"], string> = {
    teacher: "Teaches this course.",
    member: "Member of this course.",
    assistant: "Answers questions using this course's lectures and PDFs, and cites the passages it used.",
};

const CARD_WIDTH = 256;
const CARD_GAP = 8;

export function roleName(role: ChatAuthor["role"]) {
    return roleLabel[role];
}

function initials(name: string) {
    const letters = name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase());

    return letters.join("") || "?";
}

function hue(seed: string) {
    let hash = 0;

    for (const character of seed) {
        hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 360;
    }

    return hash;
}

interface ChatAvatarProps {
    author: ChatAuthor;
    size?: "small" | "large";
}

export function ChatAvatar({ author, size = "small" }: ChatAvatarProps) {
    if (author.role === "assistant") {
        return <img className={`chat-avatar chat-avatar-${size}`} src="/classiq-logo.png" alt="" />;
    }

    return (
        <span
            className={`chat-avatar chat-avatar-${size}`}
            style={{ background: `hsl(${hue(author.id ?? author.name)} 32% 34%)` }}
            aria-hidden="true"
        >
            {initials(author.name)}
        </span>
    );
}

interface AuthorCardProps {
    author: ChatAuthor;
    isYou: boolean;
    children: ReactNode;
}

export function AuthorCard({ author, isYou, children }: AuthorCardProps) {
    const id = useId();
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

    function show(element: HTMLElement) {
        const rect = element.getBoundingClientRect();

        setPosition({
            top: Math.max(CARD_GAP, rect.top - CARD_GAP),
            left: Math.min(Math.max(CARD_GAP, rect.left), window.innerWidth - CARD_WIDTH - CARD_GAP),
        });
    }

    return (
        <span
            className="chat-author"
            onMouseEnter={(event) => show(event.currentTarget)}
            onMouseLeave={() => setPosition(null)}
            onFocus={(event) => show(event.currentTarget)}
            onBlur={() => setPosition(null)}
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    setPosition(null);
                }
            }}
        >
            <button type="button" className="chat-author-trigger" aria-describedby={position ? id : undefined}>
                {children}
            </button>
            {position ? (
                <span
                    role="tooltip"
                    id={id}
                    className="chat-author-card"
                    style={{ top: position.top, left: position.left, width: CARD_WIDTH }}
                >
                    <ChatAvatar author={author} size="large" />
                    <span className="chat-author-card-name">
                        {author.name}
                        {isYou ? " (you)" : ""}
                    </span>
                    <span className="chat-author-card-role">{roleLabel[author.role]}</span>
                    <span className="chat-author-card-text">{roleDescription[author.role]}</span>
                </span>
            ) : null}
        </span>
    );
}
