import type { LlmCallOptions } from "../ai/model.ts";
import type { QuestionService } from "../qa/question-service.ts";
import type { ChatRepository } from "./chat-repository.ts";
import { ChatError } from "./errors.ts";
import {
    postMessageSchema,
    ROOM_PAGE_SIZE,
    type ChatMessage,
    type ChatPoster,
    type PostedMessage,
    type PostMessageRequest,
} from "./model.ts";
import { needsReply } from "./needs-reply.ts";

const ASSISTANT_TIMEOUT_MS = 7000;

const idPattern = /^[1-9]\d{0,9}$/;

export class ChatService {
    private readonly repository: ChatRepository;
    private readonly questions: Pick<QuestionService, "ask">;

    constructor(repository: ChatRepository, questions: Pick<QuestionService, "ask">) {
        this.repository = repository;
        this.questions = questions;
    }

    async listMessages(courseId: string, lectureId?: string): Promise<ChatMessage[]> {
        parseIds(courseId, ...(lectureId === undefined ? [] : [lectureId]));

        return this.repository.listMessages(courseId, lectureId, ROOM_PAGE_SIZE);
    }

    async postMessage(request: PostMessageRequest, poster: ChatPoster, options: LlmCallOptions = {}): Promise<PostedMessage> {
        const parsed = postMessageSchema.safeParse(request);

        if (!parsed.success) {
            throw new ChatError("invalid_request");
        }

        const { courseId, lectureId, body } = parsed.data;

        if (lectureId !== undefined && !(await this.repository.lectureExists(courseId, lectureId))) {
            throw new ChatError("not_found");
        }

        const message = await this.repository.insertUserMessage({ courseId, lectureId, body }, poster.id);

        if (!needsReply(body)) {
            return { message };
        }

        return { message, reply: await this.reply(message, options) };
    }

    async deleteMessage(courseId: string, messageId: string, poster: ChatPoster): Promise<void> {
        parseIds(courseId, messageId);

        const message = await this.repository.getMessage(courseId, messageId);

        if (!message) {
            throw new ChatError("not_found");
        }

        if (poster.role !== "teacher" && message.author.id !== poster.id) {
            throw new ChatError("forbidden");
        }

        await this.repository.deleteMessage(courseId, messageId);
    }

    private async reply(message: ChatMessage, options: LlmCallOptions): Promise<ChatMessage | undefined> {
        try {
            const answer = await this.questions.ask(
                { courseId: message.courseId, question: message.body, lectureId: message.lectureId },
                { ...options, timeoutMs: ASSISTANT_TIMEOUT_MS },
            );

            if (!answer.answerable) {
                return undefined;
            }

            return await this.repository.insertAssistantMessage({
                courseId: message.courseId,
                lectureId: message.lectureId,
                body: answer.answer,
                replyToId: message.id,
                sources: answer.sources,
            });
        } catch (error) {
            console.error(JSON.stringify({ event: "chat_reply_failed", messageId: message.id, error: String(error) }));

            return undefined;
        }
    }
}

function parseIds(...ids: string[]) {
    if (!ids.every((id) => idPattern.test(id))) {
        throw new ChatError("invalid_request");
    }
}
