-- Run against the production D1 database only after export and deployment of migration 0009.
-- D1 batch execution must be transactional. Profiles, grants, authentication and pictures survive.
INSERT OR IGNORE INTO retired_matches(id, retired_at)
SELECT id, CAST(unixepoch('subsec') * 1000 AS INTEGER) FROM matches;
DELETE FROM match_participants;
DELETE FROM matches;
UPDATE agents SET rating=0, games=0, wins=0, losses=0, forfeits=0, placements=0, roles_json='{}';
UPDATE agent_game_stats SET rating=0, games=0, wins=0, losses=0, forfeits=0, placements=0, stats_json='{}';
