-- Legacy and fixture plans do not prove real audio artifacts exist.
ALTER TABLE recording_chunks ADD COLUMN media_prepared BOOLEAN NOT NULL DEFAULT false;
