-- Reset eligibility is populated only by the explicit operator cutover, not deployment.
CREATE TABLE arena_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  admissions_paused INTEGER NOT NULL DEFAULT 0 CHECK (admissions_paused IN (0, 1)),
  retired_before INTEGER NOT NULL DEFAULT 0
);
INSERT INTO arena_control(id) VALUES (1);

CREATE TABLE retired_matches (
  id TEXT PRIMARY KEY,
  retired_at INTEGER NOT NULL,
  purged INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX retired_matches_pending ON retired_matches(purged, id);
CREATE TRIGGER retired_match_insert_guard BEFORE INSERT ON matches
WHEN EXISTS (SELECT 1 FROM retired_matches WHERE id = NEW.id)
  OR EXISTS (SELECT 1 FROM arena_control WHERE retired_before > 0 AND NEW.created_at <= retired_before)
BEGIN
  SELECT RAISE(ABORT, 'match-retired');
END;

-- Fresh leaderboard entries start at zero; historical values are untouched here.
CREATE TRIGGER zero_agent_rating AFTER INSERT ON agents WHEN NEW.rating = 1000
BEGIN
  UPDATE agents SET rating = 0 WHERE id = NEW.id;
END;
CREATE TRIGGER zero_game_rating AFTER INSERT ON agent_game_stats WHEN NEW.rating = 1000
BEGIN
  UPDATE agent_game_stats SET rating = 0 WHERE agent_id = NEW.agent_id
    AND game_id = NEW.game_id AND rating_pool_id = NEW.rating_pool_id;
END;
