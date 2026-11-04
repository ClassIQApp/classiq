CREATE TABLE recording_chunks (
    course_id INTEGER NOT NULL,
    lecture_id INTEGER NOT NULL,
    recording_id UUID NOT NULL REFERENCES upload_assets(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    start_seconds DOUBLE PRECISION NOT NULL,
    end_seconds DOUBLE PRECISION NOT NULL,
    audio_start_seconds DOUBLE PRECISION NOT NULL,
    provider_job_id TEXT,
    submissions INTEGER NOT NULL DEFAULT 0,
    submission_run_id TEXT REFERENCES processing_runs(id) ON DELETE SET NULL,
    run_submissions INTEGER NOT NULL DEFAULT 0,
    tokens JSONB,
    PRIMARY KEY (lecture_id, recording_id, position),
    FOREIGN KEY (course_id, lecture_id) REFERENCES lectures(fk_course_id, id) ON DELETE CASCADE
);

-- The typed transcript includes ordered source segments and optional Spanish text per segment.
CREATE TABLE lecture_transcripts (
    course_id INTEGER NOT NULL,
    lecture_id INTEGER PRIMARY KEY,
    recording_id UUID NOT NULL REFERENCES upload_assets(id) ON DELETE CASCADE,
    content_hash TEXT NOT NULL,
    content JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (course_id, lecture_id) REFERENCES lectures(fk_course_id, id) ON DELETE CASCADE
);
