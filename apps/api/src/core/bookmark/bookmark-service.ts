import type { BookmarkRepository } from "./bookmark-repository.ts";
import { BookmarkError } from "./errors.ts";
import { createBookmarkSchema, updateBookmarkSchema, type Bookmark } from "./model.ts";

const idPattern = /^[1-9]\d{0,9}$/;

function parseIds(...ids: string[]) {
    if (!ids.every((id) => idPattern.test(id))) {
        throw new BookmarkError("invalid_request");
    }
}

export class BookmarkService {
    private readonly repository: BookmarkRepository;

    constructor(repository: BookmarkRepository) {
        this.repository = repository;
    }

    async listBookmarks(courseId: string, lectureId: string, userId: string): Promise<Bookmark[]> {
        parseIds(courseId, lectureId);

        return this.repository.listBookmarks(courseId, lectureId, userId);
    }

    async createBookmark(courseId: string, lectureId: string, request: unknown, userId: string): Promise<Bookmark> {
        parseIds(courseId, lectureId);

        const parsed = createBookmarkSchema.safeParse(request);

        if (!parsed.success) {
            throw new BookmarkError("invalid_request");
        }

        if (!(await this.repository.lectureExists(courseId, lectureId))) {
            throw new BookmarkError("not_found");
        }

        const { startSeconds, note } = parsed.data;

        return this.repository.insertBookmark({ courseId, lectureId, startSeconds, note: note ?? "" }, userId);
    }

    async updateNote(courseId: string, lectureId: string, bookmarkId: string, request: unknown, userId: string): Promise<Bookmark> {
        parseIds(courseId, lectureId, bookmarkId);

        const parsed = updateBookmarkSchema.safeParse(request);

        if (!parsed.success) {
            throw new BookmarkError("invalid_request");
        }

        const bookmark = await this.repository.updateNote(courseId, lectureId, bookmarkId, userId, parsed.data.note);

        if (!bookmark) {
            throw new BookmarkError("not_found");
        }

        return bookmark;
    }

    async deleteBookmark(courseId: string, lectureId: string, bookmarkId: string, userId: string): Promise<void> {
        parseIds(courseId, lectureId, bookmarkId);

        if (!(await this.repository.deleteBookmark(courseId, lectureId, bookmarkId, userId))) {
            throw new BookmarkError("not_found");
        }
    }
}
