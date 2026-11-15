import type { CourseAnswer } from "../qa/model.ts";
import type { ChatRepository } from "./chat-repository.ts";
import { ChatService } from "./chat-service.ts";
import { ChatError } from "./errors.ts";
import type { ChatMessage } from "./model.ts";
import { needsReply } from "./needs-reply.ts";
import { describe, expect, it, vi } from "vitest";

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
    return {
        id: "1",
        courseId: "1",
        body: "What do enzymes lower?",
        createdAt: "2026-11-14T00:00:00.000Z",
        author: { id: "5", name: "Sam", role: "member" },
        sources: [],
        ...overrides,
    };
}

function repository(overrides: Partial<ChatRepository> = {}): ChatRepository {
    return {
        lectureExists: vi.fn(async () => true),
        listMessages: vi.fn(async () => []),
        insertUserMessage: vi.fn(async (input) => message({ body: input.body, lectureId: input.lectureId })),
        insertAssistantMessage: vi.fn(async (input) =>
            message({ id: "2", body: input.body, replyToId: input.replyToId, author: { name: "ClassIQ Assistant", role: "assistant" } }),
        ),
        getMessage: vi.fn(async () => message()),
        deleteMessage: vi.fn(async () => undefined),
        ...overrides,
    };
}

const answer: CourseAnswer = { answerable: true, answer: "Activation energy.", sources: [], context: { passages: 1, characters: 32 } };
const member = { id: "5", role: "member" } as const;

describe("needsReply", () => {
    it("replies to questions and ignores chatter", () => {
        expect(needsReply("What do enzymes lower?")).toBe(true);
        expect(needsReply("explain the electron transport chain")).toBe(true);
        expect(needsReply("is the midterm covering this lecture")).toBe(true);
        expect(needsReply("thanks, that helps a lot")).toBe(false);
        expect(needsReply("why?")).toBe(false);
    });
});

describe("ChatService.postMessage", () => {
    it("answers a question in the same room as the question", async () => {
        const repo = repository();
        const ask = vi.fn(async () => answer);
        const posted = await new ChatService(repo, { ask }).postMessage(
            { courseId: "1", lectureId: "7", body: "What do enzymes lower?" },
            member,
        );

        expect(ask).toHaveBeenCalledWith(
            { courseId: "1", question: "What do enzymes lower?", lectureId: "7" },
            expect.objectContaining({ timeoutMs: 7000 }),
        );
        expect(posted.reply).toMatchObject({ body: "Activation energy.", replyToId: "1" });
    });

    it("does not call the assistant for chatter", async () => {
        const ask = vi.fn();
        const posted = await new ChatService(repository(), { ask }).postMessage(
            { courseId: "1", body: "see you all at the review session" },
            member,
        );

        expect(ask).not.toHaveBeenCalled();
        expect(posted.reply).toBeUndefined();
    });

    it("stays quiet when the course material does not answer the question", async () => {
        const repo = repository();
        const ask = vi.fn(async (): Promise<CourseAnswer> => ({
            answerable: false,
            answer: "Nothing found.",
            sources: [],
            context: { passages: 0, characters: 0 },
        }));
        const posted = await new ChatService(repo, { ask }).postMessage(
            { courseId: "1", body: "Anyone going to the review session?" },
            member,
        );

        expect(posted.reply).toBeUndefined();
        expect(repo.insertAssistantMessage).not.toHaveBeenCalled();
    });

    it("keeps the student's message when the assistant fails", async () => {
        const repo = repository();
        const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const posted = await new ChatService(repo, {
            ask: vi.fn(async (): Promise<CourseAnswer> => {
                throw new Error("llm down");
            }),
        }).postMessage({ courseId: "1", body: "What do enzymes lower?" }, member);

        expect(posted.message.body).toBe("What do enzymes lower?");
        expect(posted.reply).toBeUndefined();
        expect(repo.insertAssistantMessage).not.toHaveBeenCalled();
        expect(logged).toHaveBeenCalledOnce();

        logged.mockRestore();
    });

    it("rejects a lecture that is not in the course", async () => {
        const service = new ChatService(repository({ lectureExists: vi.fn(async () => false) }), { ask: vi.fn() });

        await expect(service.postMessage({ courseId: "1", lectureId: "99", body: "hello there everyone" }, member)).rejects.toMatchObject({
            code: "not_found",
        });
    });
});

const serviceFor = (repo: ChatRepository) => new ChatService(repo, { ask: vi.fn() });

describe("ChatService.deleteMessage", () => {
    it("lets authors and teachers delete, but not other members", async () => {
        const repo = repository();

        await serviceFor(repo).deleteMessage("1", "1", member);
        await serviceFor(repo).deleteMessage("1", "1", { id: "9", role: "teacher" });
        await expect(serviceFor(repo).deleteMessage("1", "1", { id: "6", role: "member" })).rejects.toBeInstanceOf(ChatError);
        expect(repo.deleteMessage).toHaveBeenCalledTimes(2);
    });
});
