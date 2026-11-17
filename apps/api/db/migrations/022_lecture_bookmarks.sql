-- A bookmark is a saved moment in a lecture and belongs only to the user who made it.
CREATE TABLE IF NOT EXISTS lecture_bookmarks (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL,
    lecture_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_seconds DOUBLE PRECISION NOT NULL CHECK (start_seconds >= 0),
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (course_id, lecture_id)
        REFERENCES lectures(fk_course_id, id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS lecture_bookmarks_by_user_lecture
    ON lecture_bookmarks(user_id, course_id, lecture_id, start_seconds);
