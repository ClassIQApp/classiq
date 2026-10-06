CREATE TABLE IF NOT EXISTS lecture_chat_messages (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    fk_sender_user_id INTEGER NOT NULL
        REFERENCES users (id) ON DELETE SET NULL,
    fk_lecture_id INTEGER NOT NULL
        REFERENCES lectures (id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- used when fetching all chat messages for a given lecture
CREATE INDEX IF NOT EXISTS idx_chat_messages_by_lecture_id
    ON lecture_chat_messages (fk_lecture_id);

-- used when fetching all sent chat messages for a given user
CREATE INDEX IF NOT EXISTS idx_chat_messages_by_user_id
    ON lecture_chat_messages (fk_sender_user_id);
