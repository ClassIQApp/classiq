-- A study guide without a lecture covers the whole course.
CREATE TABLE study_guides (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lecture_id INTEGER,
    title TEXT NOT NULL CHECK (title <> ''),
    overview TEXT NOT NULL CHECK (overview <> ''),
    overview_sources JSONB NOT NULL DEFAULT '[]',
    model TEXT NOT NULL,
    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (course_id, id),
    FOREIGN KEY (course_id, lecture_id)
        REFERENCES lectures(fk_course_id, id)
        ON DELETE CASCADE
);

CREATE INDEX study_guides_by_course
    ON study_guides(course_id, lecture_id);

-- Each section keeps a snapshot of the source context used to generate it,
-- so citations remain available even if indexed content changes later.
CREATE TABLE study_guide_sections (
    id SERIAL PRIMARY KEY,
    study_guide_id INTEGER NOT NULL
        REFERENCES study_guides(id)
        ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    heading TEXT NOT NULL CHECK (heading <> ''),
    content TEXT NOT NULL CHECK (content <> ''),
    key_points TEXT[] NOT NULL CHECK (cardinality(key_points) > 0),
    sources JSONB NOT NULL DEFAULT '[]',
    UNIQUE (study_guide_id, position)
);