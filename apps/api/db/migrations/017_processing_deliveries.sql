-- Durable local continuation receipts; retain until the owning run is deleted.
CREATE TABLE processing_deliveries (
    delivery_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES processing_runs(id) ON DELETE CASCADE,
    owner UUID NOT NULL,
    lease_until TIMESTAMPTZ NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT false
);
