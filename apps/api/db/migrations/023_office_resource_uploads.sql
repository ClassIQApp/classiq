DO $$
DECLARE
    existing TEXT;
BEGIN
    FOR existing IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'upload_assets'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%application/pdf%'
    LOOP
        EXECUTE format('ALTER TABLE upload_assets DROP CONSTRAINT %I', existing);
    END LOOP;
END
$$;

ALTER TABLE upload_assets
    ADD CONSTRAINT upload_assets_content_type_and_size CHECK (
        (kind = 'resource'
            AND content_type IN (
                'application/pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            )
            AND content_length <= 26214400)
        OR (kind = 'recording'
            AND content_type IN ('audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/webm', 'video/mp4', 'video/webm')
            AND content_length <= 524288000)
    );
