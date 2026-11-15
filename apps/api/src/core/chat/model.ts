import type { CourseRole } from "../course-access/model.ts";
import type { QuestionSource } from "../qa/model.ts";
import * as z from "zod/mini";

const id = z.string().check(z.regex(/^[1-9]\d{0,9}$/));

export const MAX_MESSAGE_LENGTH = 2000;
export const ROOM_PAGE_SIZE = 50;

export const postMessageSchema = z.strictObject({
    courseId: id,
    lectureId: z.optional(id),
    body: z.string().check(z.trim(), z.minLength(1), z.maxLength(MAX_MESSAGE_LENGTH)),
});
export type PostMessageRequest = z.input<typeof postMessageSchema>;

export type ChatAuthorRole = CourseRole | "assistant";

export interface ChatAuthor {
    readonly id?: string;
    readonly name: string;
    readonly role: ChatAuthorRole;
}

export interface ChatMessage {
    readonly id: string;
    readonly courseId: string;
    readonly lectureId?: string;
    readonly body: string;
    readonly createdAt: string;
    readonly author: ChatAuthor;
    readonly replyToId?: string;
    readonly sources: readonly QuestionSource[];
}

export interface ChatPoster {
    readonly id: string;
    readonly role: CourseRole;
}

export interface NewChatMessage {
    readonly courseId: string;
    readonly lectureId?: string;
    readonly body: string;
}

export interface NewAssistantMessage extends NewChatMessage {
    readonly replyToId: string;
    readonly sources: readonly QuestionSource[];
}

export interface PostedMessage {
    readonly message: ChatMessage;
    readonly reply?: ChatMessage;
}
