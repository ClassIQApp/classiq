import type { QuestionSource } from "../qa/model.ts";
import type { ChatRepository } from "./chat-repository.ts";
import type { ChatMessage, NewAssistantMessage, NewChatMessage } from "./model.ts";
import { DatabaseError, type Pool } from "pg";

const ASSISTANT_NAME = "ClassIQ Assistant";
const UNIQUE_VIOLATION = "23505";

const MESSAGE_SELECT = `
    SELECT
        message.id,
        message.course_id,
        message.lecture_id,
        message.body,
        message.sources,
        message.created_at,
        message.reply_to_id,
        message.is_assistant,
        message.author_user_id,
        author.name AS author_name,
        membership.role AS author_role
    FROM chat_messages message
    LEFT JOIN users author ON author.id = message.author_user_id
    LEFT JOIN course_memberships membership
        ON membership.course_id = message.course_id AND membership.user_id = message.author_user_id
`;

interface MessageRow {
    id: number;
    course_id: number;
    lecture_id: number | null;
    body: string;
    sources: QuestionSource[];
    created_at: Date;
    reply_to_id: number | null;
    is_assistant: boolean;
    author_user_id: number | null;
    author_name: string | null;
    author_role: string | null;
}

function toMessage(row: MessageRow): ChatMessage {
    return {
        id: String(row.id),
        courseId: String(row.course_id),
        ...(row.lecture_id === null ? {} : { lectureId: String(row.lecture_id) }),
        body: row.body,
        createdAt: row.created_at.toISOString(),
        author: row.is_assistant
            ? { name: ASSISTANT_NAME, role: "assistant" }
            : {
                  ...(row.author_user_id === null ? {} : { id: String(row.author_user_id) }),
                  name: row.author_name?.trim() || "Member",
                  role: row.author_role === "teacher" ? "teacher" : "member",
              },
        ...(row.reply_to_id === null ? {} : { replyToId: String(row.reply_to_id) }),
        sources: row.sources,
    };
}

export class PostgresChatRepository implements ChatRepository {
    private readonly pool: Pool;

    constructor(pool: Pool) {
        this.pool = pool;
    }

    async lectureExists(courseId: string, lectureId: string): Promise<boolean> {
        const result = await this.pool.query("SELECT 1 FROM lectures WHERE fk_course_id = $1 AND id = $2", [courseId, lectureId]);

        return result.rowCount === 1;
    }

    async listMessages(courseId: string, lectureId: string | undefined, limit: number): Promise<ChatMessage[]> {
        const result = await this.pool.query<MessageRow>(
            `${MESSAGE_SELECT}
             WHERE message.course_id = $1 AND message.lecture_id IS NOT DISTINCT FROM $2::int
             ORDER BY message.id DESC
             LIMIT $3`,
            [courseId, lectureId ?? null, limit],
        );

        return result.rows.map((row) => toMessage(row)).toReversed();
    }

    async insertUserMessage(message: NewChatMessage, authorUserId: string): Promise<ChatMessage> {
        const inserted = await this.pool.query<{ id: number }>(
            `INSERT INTO chat_messages (course_id, lecture_id, author_user_id, body)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [message.courseId, message.lectureId ?? null, authorUserId, message.body],
        );

        return this.loadMessage(inserted.rows[0]!.id);
    }

    async insertAssistantMessage(message: NewAssistantMessage): Promise<ChatMessage | undefined> {
        try {
            const inserted = await this.pool.query<{ id: number }>(
                `INSERT INTO chat_messages (course_id, lecture_id, is_assistant, reply_to_id, body, sources)
                 VALUES ($1, $2, TRUE, $3, $4, $5)
                 RETURNING id`,
                [message.courseId, message.lectureId ?? null, message.replyToId, message.body, JSON.stringify(message.sources)],
            );

            return await this.loadMessage(inserted.rows[0]!.id);
        } catch (error) {
            if (error instanceof DatabaseError && error.code === UNIQUE_VIOLATION) {
                return undefined;
            }

            throw error;
        }
    }

    async getMessage(courseId: string, messageId: string): Promise<ChatMessage | undefined> {
        const result = await this.pool.query<MessageRow>(`${MESSAGE_SELECT} WHERE message.course_id = $1 AND message.id = $2`, [
            courseId,
            messageId,
        ]);

        return result.rows[0] ? toMessage(result.rows[0]) : undefined;
    }

    async deleteMessage(courseId: string, messageId: string): Promise<void> {
        await this.pool.query("DELETE FROM chat_messages WHERE course_id = $1 AND id = $2", [courseId, messageId]);
    }

    private async loadMessage(id: number): Promise<ChatMessage> {
        const result = await this.pool.query<MessageRow>(`${MESSAGE_SELECT} WHERE message.id = $1`, [id]);

        return toMessage(result.rows[0]!);
    }
}
