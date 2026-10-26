ALTER TABLE lectures
    ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'processing'
        CHECK (status IN ('ready', 'processing', 'failed')),
    ADD COLUMN IF NOT EXISTS status_message TEXT NOT NULL DEFAULT '';