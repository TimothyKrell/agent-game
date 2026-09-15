-- An outer registry UPSERT can override a trigger's OR IGNORE conflict policy.
-- Explicit absence checks retain tombstones when an already closed origin is recreated.
DROP TRIGGER preview_arena_retire;
CREATE TRIGGER preview_arena_retire AFTER UPDATE ON preview_arenas
WHEN OLD.incarnation<>NEW.incarnation OR NEW.closed_at IS NOT NULL
BEGIN
  INSERT INTO preview_retired_arenas (origin, incarnation)
  SELECT OLD.origin, OLD.incarnation
  WHERE NOT EXISTS (
    SELECT 1 FROM preview_retired_arenas WHERE origin=OLD.origin AND incarnation=OLD.incarnation
  );
END;
DROP TRIGGER preview_arena_delete;
CREATE TRIGGER preview_arena_delete AFTER DELETE ON preview_arenas
BEGIN
  INSERT INTO preview_retired_arenas (origin, incarnation)
  SELECT OLD.origin, OLD.incarnation
  WHERE NOT EXISTS (
    SELECT 1 FROM preview_retired_arenas WHERE origin=OLD.origin AND incarnation=OLD.incarnation
  );
END;
