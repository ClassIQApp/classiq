-- A short transaction owns a lease; no subject lock is held across a provider call.
CREATE TABLE processing_invocations (
    course_id INTEGER NOT NULL,
    lecture_id INTEGER NOT NULL,
    operation TEXT NOT NULL,
    owner UUID NOT NULL,
    run_id TEXT NOT NULL REFERENCES processing_runs(id) ON DELETE CASCADE,
    lease_until TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (lecture_id, operation),
    FOREIGN KEY (course_id, lecture_id) REFERENCES lectures(fk_course_id, id) ON DELETE CASCADE
);
