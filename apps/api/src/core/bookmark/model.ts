import * as z from "zod/mini";

export const MAX_NOTE_LENGTH = 280;

const note = z.string().check(z.trim(), z.maxLength(MAX_NOTE_LENGTH));

export const createBookmarkSchema = z.strictObject({
    startSeconds: z.number().check(z.gte(0), z.lte(86_400 * 7)),
    note: z.optional(note),
});

export const updateBookmarkSchema = z.strictObject({ note });

export interface Bookmark {
    readonly id: string;
    readonly courseId: string;
    readonly lectureId: string;
    readonly startSeconds: number;
    readonly note: string;
    readonly createdAt: string;
}

export interface NewBookmark {
    readonly courseId: string;
    readonly lectureId: string;
    readonly startSeconds: number;
    readonly note: string;
}
