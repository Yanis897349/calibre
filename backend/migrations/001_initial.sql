CREATE TABLE IF NOT EXISTS dataset_state (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sensitivity_observations (
    id BIGSERIAL PRIMARY KEY,
    player_key TEXT NOT NULL,
    dpi DOUBLE PRECISION NOT NULL CHECK (dpi > 0),
    sensitivity DOUBLE PRECISION NOT NULL CHECK (sensitivity > 0),
    source_url TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    source_updated_at TIMESTAMPTZ,
    payload JSONB NOT NULL,
    UNIQUE (player_key, source_url, observed_at)
);
CREATE INDEX IF NOT EXISTS sensitivity_player_time ON sensitivity_observations(player_key, observed_at DESC);
CREATE TABLE IF NOT EXISTS import_runs (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL,
    message TEXT NOT NULL,
    records INTEGER NOT NULL
);
