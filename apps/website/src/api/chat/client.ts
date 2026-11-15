import type { ApiFetch } from "../auth/client";

export interface ChatSource {
    kind: "transcript" | "resource";
    lectureId?: string;
    resourceId?: string;
    title: string;
    pageNumber?: number;
    startSeconds?: number;
    endSeconds?: number;
}

export type ChatAuthorRole = "teacher" | "member" | "assistant";

export interface ChatAuthor {
    id?: string;
    name: string;
    role: ChatAuthorRole;
}

export interface ChatMessage {
    id: string;
    courseId: string;
    lectureId?: string;
    body: string;
    createdAt: string;
    author: ChatAuthor;
    replyToId?: string;
    sources: ChatSource[];
}

export interface PostedMessage {
    message: ChatMessage;
    reply?: ChatMessage;
}

export const chatQueryKey = (accountId: string, courseId: string, lectureId: string) =>
    ["accounts", accountId, "courses", courseId, "chat", lectureId || "course"] as const;

const root = (courseId: string) => `/courses/${encodeURIComponent(courseId)}/chat/messages`;

export function createChatApi(request: ApiFetch) {
    async function list(courseId: string, lectureId?: string, signal?: AbortSignal): Promise<ChatMessage[]> {
        const parameters = lectureId ? `?${new URLSearchParams({ lectureId })}` : "";
        const response = await request(`${root(courseId)}${parameters}`, { signal });
        const data: { items: ChatMessage[] } = await response.json();

        return data.items;
    }

    async function post(courseId: string, body: string, lectureId?: string): Promise<PostedMessage> {
        const response = await request(root(courseId), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                body,
                ...(lectureId ? { lectureId } : {}),
            }),
        });

        return response.json();
    }

    async function remove(courseId: string, messageId: string): Promise<void> {
        await request(`${root(courseId)}/${encodeURIComponent(messageId)}`, { method: "DELETE" });
    }

    return { list, post, remove };
}
