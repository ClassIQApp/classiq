CREATE TABLE processing_runs (
    id TEXT PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lecture_id INTEGER,
    resource_id INTEGER,
    number INTEGER NOT NULL CHECK (number >= 1),
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deadline TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    error_code TEXT,
    status_message TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (course_id, lecture_id) REFERENCES lectures(fk_course_id, id) ON DELETE CASCADE,
    FOREIGN KEY (course_id, resource_id) REFERENCES course_resources(fk_course_id, id) ON DELETE CASCADE,
    CHECK ((lecture_id IS NULL) <> (resource_id IS NULL))
);
CREATE UNIQUE INDEX processing_lecture_run_number ON processing_runs(lecture_id, number) WHERE lecture_id IS NOT NULL;
CREATE UNIQUE INDEX processing_resource_run_number ON processing_runs(resource_id, number) WHERE resource_id IS NOT NULL;
CREATE INDEX processing_run_deadlines ON processing_runs(deadline) WHERE status = 'running';

CREATE TABLE processing_stages (
    run_id TEXT NOT NULL REFERENCES processing_runs(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    status_message TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (run_id, stage)
);
