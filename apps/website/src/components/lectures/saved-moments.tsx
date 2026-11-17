import { MAX_BOOKMARK_NOTE_LENGTH, type Bookmark } from "../../api/bookmarks/client";
import type { LectureBookmarks } from "../../api/bookmarks/use-bookmarks";
import { formatTimestamp, TimestampButton } from "./timestamp";
import { PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

interface SavedMomentsProps {
    bookmarks: LectureBookmarks;
    onSeek: (seconds: number) => void;
}

interface SavedMomentProps {
    bookmark: Bookmark;
    startEditing: boolean;
    saving: boolean;
    onSeek: (seconds: number) => void;
    onSaveNote: (id: string, note: string) => Promise<unknown>;
    onDelete: (id: string) => void;
}

interface NoteFormProps {
    bookmark: Bookmark;
    saving: boolean;
    onSubmit: (note: string) => void;
    onCancel: () => void;
}

function NoteForm({ bookmark, saving, onSubmit, onCancel }: NoteFormProps) {
    const [note, setNote] = useState(bookmark.note);
    const input = useRef<HTMLInputElement>(null);
    const time = formatTimestamp(bookmark.startSeconds);

    useEffect(() => input.current?.focus(), []);

    function submit(event: FormEvent) {
        event.preventDefault();
        onSubmit(note.trim());
    }

    function cancelOnEscape(event: KeyboardEvent) {
        if (event.key === "Escape") {
            onCancel();
        }
    }

    return (
        <form className="moment-note-form" onSubmit={submit} onKeyDown={cancelOnEscape}>
            <input
                ref={input}
                value={note}
                maxLength={MAX_BOOKMARK_NOTE_LENGTH}
                placeholder="Add a short note"
                aria-label={`Note for ${time}`}
                onChange={(event) => setNote(event.target.value)}
            />
            <button type="submit" className="moment-action moment-action-primary" disabled={saving}>
                Save
            </button>
            <button type="button" className="moment-action" onClick={onCancel}>
                Cancel
            </button>
        </form>
    );
}

function SavedMoment({ bookmark, startEditing, saving, onSeek, onSaveNote, onDelete }: SavedMomentProps) {
    const [editing, setEditing] = useState(startEditing);
    const time = formatTimestamp(bookmark.startSeconds);

    async function saveNote(note: string) {
        await onSaveNote(bookmark.id, note);
        setEditing(false);
    }

    return (
        <li className="moment-item">
            <TimestampButton seconds={bookmark.startSeconds} onSeek={onSeek} />
            {editing ? (
                <NoteForm
                    bookmark={bookmark}
                    saving={saving}
                    onSubmit={(note) => void saveNote(note).catch(() => undefined)}
                    onCancel={() => setEditing(false)}
                />
            ) : (
                <>
                    <p className={bookmark.note ? "moment-note" : "moment-note moment-note-empty"}>{bookmark.note || "No note"}</p>
                    <div className="moment-actions">
                        <button
                            type="button"
                            className="moment-icon-button"
                            aria-label={`${bookmark.note ? "Edit" : "Add"} note for ${time}`}
                            title={bookmark.note ? "Edit note" : "Add note"}
                            onClick={() => setEditing(true)}
                        >
                            <PencilSimpleIcon size={16} aria-hidden />
                        </button>
                        <button
                            type="button"
                            className="moment-icon-button moment-icon-button-danger"
                            aria-label={`Delete saved moment at ${time}`}
                            title="Delete"
                            onClick={() => onDelete(bookmark.id)}
                        >
                            <TrashIcon size={16} aria-hidden />
                        </button>
                    </div>
                </>
            )}
        </li>
    );
}

export default function SavedMoments({ bookmarks, onSeek }: SavedMomentsProps) {
    const { list, add, editNote, remove, lastAddedId } = bookmarks;
    const items = list.data ?? [];
    const failure = [add, editNote, remove].find((mutation) => mutation.isError);
    const addedBookmark = add.isSuccess ? add.data : undefined;

    let body;

    if (list.isError) {
        body = (
            <div className="lecture-status-error" role="alert">
                <span>Saved moments couldn&apos;t be loaded.</span>
                <button type="button" className="lecture-text-button" onClick={() => void list.refetch()}>
                    Try again
                </button>
            </div>
        );
    } else if (list.isPending) {
        body = <p className="lecture-muted">Loading saved moments…</p>;
    } else if (items.length === 0) {
        body = (
            <p className="lecture-muted">
                Nothing saved yet. Save a moment while you listen, or use the bookmark beside a transcript paragraph.
            </p>
        );
    } else {
        body = (
            <ul className="moment-list">
                {items.map((bookmark) => (
                    <SavedMoment
                        key={bookmark.id}
                        bookmark={bookmark}
                        startEditing={bookmark.id === lastAddedId}
                        saving={editNote.isPending}
                        onSeek={onSeek}
                        onSaveNote={(id, note) => editNote.mutateAsync({ id, note })}
                        onDelete={(id) => remove.mutate(id)}
                    />
                ))}
            </ul>
        );
    }

    return (
        <section className="lecture-card" aria-labelledby="saved-moments-heading">
            <h2 id="saved-moments-heading">
                Saved moments
                {items.length > 0 && <span className="lecture-count">{items.length}</span>}
            </h2>
            <p className="lecture-sr-only" role="status">
                {addedBookmark ? `Saved moment at ${formatTimestamp(addedBookmark.startSeconds)}` : ""}
            </p>
            {failure && (
                <p className="lecture-muted moment-error" role="alert">
                    {failure.error instanceof Error ? failure.error.message : "That change couldn't be saved."}
                </p>
            )}
            {body}
        </section>
    );
}
