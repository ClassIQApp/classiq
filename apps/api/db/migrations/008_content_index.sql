CREATE TABLE content_sources (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('transcript', 'resource')),
    lecture_id INTEGER,
    resource_id INTEGER,
    status TEXT NOT NULL CHECK (status IN ('indexed', 'failed')),
    status_message TEXT NOT NULL DEFAULT '',
    content_hash TEXT,
    indexed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (course_id, id),
    FOREIGN KEY (course_id, lecture_id) REFERENCES lectures(fk_course_id, id) ON DELETE CASCADE,
    FOREIGN KEY (course_id, resource_id) REFERENCES course_resources(fk_course_id, id) ON DELETE CASCADE,
    CHECK ((kind = 'transcript' AND lecture_id IS NOT NULL AND resource_id IS NULL)
        OR (kind = 'resource' AND resource_id IS NOT NULL AND lecture_id IS NULL)),
    CHECK ((status = 'indexed') = (content_hash IS NOT NULL))
);
CREATE UNIQUE INDEX one_transcript_source_per_lecture ON content_sources(lecture_id) WHERE kind = 'transcript';
CREATE UNIQUE INDEX one_content_source_per_resource ON content_sources(resource_id) WHERE kind = 'resource';

-- chunks carry course_id so retrieval stays scoped to one course without joining through sources
CREATE TABLE content_chunks (
    id SERIAL PRIMARY KEY,
    source_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    content TEXT NOT NULL CHECK (content <> ''),
    page_number INTEGER CHECK (page_number >= 1),
    start_seconds DOUBLE PRECISION CHECK (start_seconds >= 0),
    end_seconds DOUBLE PRECISION CHECK (end_seconds >= start_seconds),
    search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    UNIQUE (source_id, position),
    FOREIGN KEY (course_id, source_id) REFERENCES content_sources(course_id, id) ON DELETE CASCADE,
    CHECK ((page_number IS NOT NULL AND start_seconds IS NULL AND end_seconds IS NULL)
        OR (page_number IS NULL AND start_seconds IS NOT NULL AND end_seconds IS NOT NULL))
);
CREATE INDEX content_chunks_search_idx ON content_chunks USING GIN (search_vector);
CREATE INDEX content_chunks_by_course ON content_chunks(course_id);
