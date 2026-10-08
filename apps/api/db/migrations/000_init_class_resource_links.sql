CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY
);



CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- used when fetching course from URL slug
CREATE INDEX IF NOT EXISTS idx_courses_by_slug
    ON courses (slug);



CREATE TABLE IF NOT EXISTS lectures (
    id SERIAL PRIMARY KEY,
    fk_course_id INTEGER NOT NULL
        REFERENCES courses (id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- used when fetching all lectures for a given course
CREATE INDEX IF NOT EXISTS idx_lectures_by_course_id
    ON lectures (fk_course_id);



CREATE TABLE IF NOT EXISTS course_resources (
    id SERIAL PRIMARY KEY,
    fk_course_id INTEGER NOT NULL
        REFERENCES courses (id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- used when fetching all resources for a given course
CREATE INDEX IF NOT EXISTS idx_course_resources_by_course_id
    ON course_resources (fk_course_id);



CREATE TABLE IF NOT EXISTS course_resource_links (
    id SERIAL PRIMARY KEY,
    link_start_timestamp_seconds BIGINT NOT NULL
        CHECK (link_start_timestamp_seconds >= 0),
    fk_lecture_id INTEGER NOT NULL
        REFERENCES lectures (id) ON DELETE CASCADE,
    fk_linked_course_resource_id INTEGER NOT NULL
        REFERENCES course_resources (id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- used when fetching all linked resources for a given lecture when first loaded
CREATE INDEX IF NOT EXISTS idx_course_resource_links_by_lecture_id
    ON course_resource_links (fk_lecture_id);

-- used when fetching all resources for a given course resource
-- e.g. on the course resource detail page, a view of "Linked in These Lectures"
CREATE INDEX IF NOT EXISTS idx_course_resource_links_by_course_resource_id
    ON course_resource_links (fk_linked_course_resource_id);
