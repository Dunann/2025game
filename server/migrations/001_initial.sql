CREATE TABLE IF NOT EXISTS players (
  id text PRIMARY KEY,
  created_at double precision NOT NULL CHECK (created_at >= 0)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  player_id text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  expires_at double precision NOT NULL CHECK (expires_at >= 0)
);
CREATE INDEX IF NOT EXISTS sessions_player_idx ON sessions(player_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS settings (
  player_id text PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  playing_card_mode boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS runs (
  player_id text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  status text NOT NULL CHECK (status IN ('active', 'won', 'given_up', 'abandoned')),
  started_at double precision NOT NULL CHECK (started_at >= 0),
  ended_at double precision,
  elapsed_ms double precision CHECK (elapsed_ms >= 0 AND elapsed_ms <= 31536000000),
  PRIMARY KEY (player_id, id),
  CHECK ((status = 'active' AND ended_at IS NULL AND elapsed_ms IS NULL)
    OR (status <> 'active' AND ended_at IS NOT NULL AND ended_at >= started_at)),
  CHECK (status IN ('active', 'abandoned') OR elapsed_ms IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS runs_one_active_idx ON runs(player_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS runs_player_ended_idx ON runs(player_id, ended_at DESC);
