-- The existing agents columns remain the canonical Secret Overlord rating pool.
ALTER TABLE matches ADD COLUMN game_id TEXT NOT NULL DEFAULT 'secret-overlord';
ALTER TABLE matches ADD COLUMN rules_version TEXT NOT NULL DEFAULT 'secret-overlord-1';
ALTER TABLE matches ADD COLUMN rating_pool_id TEXT NOT NULL DEFAULT 'secret-overlord-1';
ALTER TABLE matches ADD COLUMN result_json TEXT;
ALTER TABLE matches ADD COLUMN summary_json TEXT;
ALTER TABLE matches ADD COLUMN source_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE matches ADD COLUMN index_fingerprint TEXT;
ALTER TABLE matches ADD COLUMN identity_fingerprint TEXT;
ALTER TABLE matches ADD COLUMN settlement_fingerprint TEXT;
ALTER TABLE match_participants ADD COLUMN result_json TEXT;
ALTER TABLE match_participants ADD COLUMN act1_json TEXT;

UPDATE matches SET rating_version = 'team-elo-1'
WHERE rating_version IS NULL AND game_id = 'secret-overlord' AND rules_version = 'secret-overlord-1';

CREATE TABLE agent_game_stats (
  agent_id TEXT NOT NULL REFERENCES agents(id),
  game_id TEXT NOT NULL,
  rating_pool_id TEXT NOT NULL,
  rating REAL NOT NULL DEFAULT 1000,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  forfeits INTEGER NOT NULL DEFAULT 0,
  placements INTEGER NOT NULL DEFAULT 0,
  stats_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (agent_id, game_id, rating_pool_id)
);
CREATE INDEX matches_game_status_created ON matches(game_id, status, created_at DESC);
CREATE INDEX game_stats_leaderboard ON agent_game_stats(game_id, rating_pool_id, placements, rating DESC);

-- Enforce these fences in SQLite too: two index writers can race between their reads and batches.
CREATE TRIGGER matches_identity_guard BEFORE UPDATE ON matches
WHEN NEW.game_id != OLD.game_id OR NEW.rules_version != OLD.rules_version
  OR NEW.rating_pool_id != OLD.rating_pool_id OR NEW.rating_version IS NOT OLD.rating_version
  OR NEW.mode != OLD.mode OR NEW.created_at != OLD.created_at OR NEW.model IS NOT OLD.model
  OR (OLD.identity_fingerprint IS NOT NULL AND NEW.identity_fingerprint IS NOT OLD.identity_fingerprint)
BEGIN
  SELECT RAISE(ABORT, 'match-identity-integrity');
END;

CREATE TRIGGER matches_revision_guard BEFORE UPDATE ON matches
WHEN NEW.source_revision < OLD.source_revision
  OR (NEW.source_revision = OLD.source_revision AND OLD.index_fingerprint IS NOT NULL
    AND NEW.index_fingerprint IS NOT OLD.index_fingerprint)
BEGIN
  SELECT RAISE(ABORT, 'match-revision-integrity');
END;

CREATE TRIGGER matches_terminal_guard BEFORE UPDATE ON matches
WHEN (OLD.status != 'active' AND (NEW.status != OLD.status OR NEW.result_json IS NOT OLD.result_json
  OR NEW.winner IS NOT OLD.winner OR NEW.win_reason IS NOT OLD.win_reason OR NEW.finished_at IS NOT OLD.finished_at))
  OR NEW.result_applied < OLD.result_applied
BEGIN
  SELECT RAISE(ABORT, 'match-terminal-integrity');
END;

CREATE TRIGGER matches_settlement_guard BEFORE UPDATE ON matches
WHEN OLD.settlement_fingerprint IS NOT NULL AND NEW.settlement_fingerprint IS NOT OLD.settlement_fingerprint
BEGIN
  SELECT RAISE(ABORT, 'match-settlement-integrity');
END;
