import type { ChatMessage, NewAssistantMessage, NewChatMessage } from "./model.ts";

export interface ChatRepository {
    lectureExists(courseId: string, lectureId: string): Promise<boolean>;
    listMessages(courseId: string, lectureId: string | undefined, limit: number): Promise<ChatMessage[]>;
    insertUserMessage(message: NewChatMessage, authorUserId: string): Promise<ChatMessage>;
    insertAssistantMessage(message: NewAssistantMessage): Promise<ChatMessage | undefined>;
    getMessage(courseId: string, messageId: string): Promise<ChatMessage | undefined>;
    deleteMessage(courseId: string, messageId: string): Promise<void>;
}
