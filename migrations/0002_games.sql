-- The existing agents columns remain the canonical Secret Overlord rating pool.
ALTER TABLE matches ADD COLUMN game_id TEXT NOT NULL DEFAULT 'secret-overlord';
ALTER TABLE matches ADD COLUMN rules_version TEXT NOT NULL DEFAULT 'secret-overlord-1';
ALTER TABLE matches ADD COLUMN rating_pool_id TEXT NOT NULL DEFAULT 'secret-overlord-1';
ALTER TABLE matches ADD COLUMN result_json TEXT;
ALTER TABLE matches ADD COLUMN summary_json TEXT;
ALTER TABLE matches ADD COLUMN source_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE matches ADD COLUMN index_fingerprint TEXT;
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
