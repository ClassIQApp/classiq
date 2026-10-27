ALTER TABLE lectures DROP CONSTRAINT lectures_status_check;
ALTER TABLE lectures ADD CONSTRAINT lectures_status_check
    CHECK (status IN ('pending', 'uploaded', 'ready', 'processing', 'failed'));
ALTER TABLE lectures ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE lectures ADD CONSTRAINT lectures_course_id_unique UNIQUE (fk_course_id, id);
ALTER TABLE course_resources ADD COLUMN fk_lecture_id INTEGER;
ALTER TABLE course_resources ADD CONSTRAINT resource_lecture_parent
    FOREIGN KEY (fk_course_id, fk_lecture_id) REFERENCES lectures (fk_course_id, id) ON DELETE CASCADE;
ALTER TABLE course_resources ADD CONSTRAINT resources_course_id_unique UNIQUE (fk_course_id, id);

CREATE TABLE upload_assets (
    id UUID PRIMARY KEY,
    upload_id UUID NOT NULL UNIQUE,
    idempotency_key UUID,
    UNIQUE (course_id, idempotency_key),
    kind TEXT NOT NULL CHECK (kind IN ('recording', 'resource')),
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lecture_id INTEGER,
    resource_id INTEGER,
    name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    content_length BIGINT NOT NULL CHECK (content_length > 0),
    upload_status TEXT NOT NULL DEFAULT 'pending' CHECK (upload_status IN ('pending', 'uploaded', 'failed')),
    FOREIGN KEY (course_id, lecture_id) REFERENCES lectures(fk_course_id, id) ON DELETE CASCADE,
    FOREIGN KEY (course_id, resource_id) REFERENCES course_resources(fk_course_id, id) ON DELETE CASCADE,
    CHECK ((kind = 'recording' AND lecture_id IS NOT NULL AND resource_id IS NULL)
        OR (kind = 'resource' AND resource_id IS NOT NULL)),
    CHECK ((kind = 'resource' AND content_type = 'application/pdf' AND content_length <= 26214400)
        OR (kind = 'recording' AND content_type IN ('audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/webm', 'video/mp4', 'video/webm') AND content_length <= 524288000))
);
CREATE UNIQUE INDEX one_recording_per_lecture ON upload_assets(lecture_id) WHERE kind = 'recording';
CREATE UNIQUE INDEX one_upload_per_resource ON upload_assets(resource_id) WHERE kind = 'resource';
CREATE INDEX uploads_by_course ON upload_assets(course_id);
