ALTER TABLE processing_runs ADD COLUMN dispatched_at TIMESTAMPTZ;
CREATE INDEX undispatched_processing_runs ON processing_runs(started_at) WHERE status='running' AND dispatched_at IS NULL;
