CREATE TABLE lecture_generated_content (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL,
    lecture_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    content JSONB NOT NULL,
    source_hash TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (lecture_id, kind),
    UNIQUE (course_id, id),
    FOREIGN KEY (course_id, lecture_id) REFERENCES lectures(fk_course_id, id) ON DELETE CASCADE
);
