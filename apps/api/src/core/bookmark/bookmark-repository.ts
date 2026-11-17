import type { Bookmark, NewBookmark } from "./model.ts";

export interface BookmarkRepository {
    lectureExists(courseId: string, lectureId: string): Promise<boolean>;
    listBookmarks(courseId: string, lectureId: string, userId: string): Promise<Bookmark[]>;
    insertBookmark(bookmark: NewBookmark, userId: string): Promise<Bookmark>;
    updateNote(courseId: string, lectureId: string, bookmarkId: string, userId: string, note: string): Promise<Bookmark | undefined>;
    deleteBookmark(courseId: string, lectureId: string, bookmarkId: string, userId: string): Promise<boolean>;
}
