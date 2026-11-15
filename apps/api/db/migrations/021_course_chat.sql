-- A message without a lecture belongs to the course room; otherwise to that lecture's room.
-- An assistant reply points at the message it answers, and a message gets at most one.
CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lecture_id INTEGER,
    author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_assistant BOOLEAN NOT NULL DEFAULT FALSE,
    reply_to_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL,
    body TEXT NOT NULL CHECK (body <> ''),
    sources JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (course_id, lecture_id)
        REFERENCES lectures(fk_course_id, id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS chat_messages_by_room
    ON chat_messages(course_id, lecture_id, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS one_assistant_reply_per_message
    ON chat_messages(reply_to_id)
    WHERE is_assistant;
