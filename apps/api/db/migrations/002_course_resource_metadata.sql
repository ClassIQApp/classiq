ALTER TABLE course_resources
    ADD COLUMN name TEXT,
    ADD COLUMN content_type TEXT,
    ADD COLUMN content_length BIGINT,
    ADD COLUMN upload_status TEXT NOT NULL DEFAULT 'pending';
