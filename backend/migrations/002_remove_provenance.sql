DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'sensitivity_observations' AND column_name = 'source_url'
    ) THEN
        UPDATE sensitivity_observations
        SET payload = (payload - 'source_url' - 'source_updated_at' - 'acquisition')
            || jsonb_build_object('updated_at', source_updated_at);

        DELETE FROM sensitivity_observations older
        USING sensitivity_observations newer
        WHERE older.id < newer.id
          AND older.player_key = newer.player_key
          AND older.observed_at = newer.observed_at
          AND older.dpi = newer.dpi
          AND older.sensitivity = newer.sensitivity;

        ALTER TABLE sensitivity_observations DROP COLUMN source_url;
        ALTER TABLE sensitivity_observations RENAME COLUMN source_updated_at TO updated_at;
        CREATE UNIQUE INDEX sensitivity_observation_identity
            ON sensitivity_observations(player_key, observed_at, dpi, sensitivity);

        UPDATE dataset_state
        SET payload = (payload - 'sources') || jsonb_build_object(
            'settings', (
                SELECT COALESCE(jsonb_agg(
                    (setting - 'source_url' - 'source_updated_at' - 'acquisition')
                    || jsonb_build_object('updated_at', COALESCE(setting->'updated_at', setting->'source_updated_at'))
                    ORDER BY position
                ), '[]'::jsonb)
                FROM jsonb_array_elements(payload->'settings') WITH ORDINALITY AS items(setting, position)
            ),
            'events', (
                SELECT COALESCE(jsonb_agg(event - 'source_url' ORDER BY position), '[]'::jsonb)
                FROM jsonb_array_elements(payload->'events') WITH ORDINALITY AS items(event, position)
            )
        );
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'import_runs' AND column_name = 'source'
    ) THEN
        ALTER TABLE import_runs RENAME COLUMN source TO dataset;
        UPDATE import_runs SET dataset = CASE dataset
            WHEN 'ProSettings' THEN 'settings'
            WHEN 'VCT Reference' THEN 'competitive'
            WHEN 'Tournament results' THEN 'events'
            ELSE 'unknown'
        END;
    END IF;
END $$;
