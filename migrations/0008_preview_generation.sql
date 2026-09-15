-- Trusted control-plane generations are independent of registry/target row lifetime.
-- Never cascade these records when an arena, artifact or incarnation is retired.
CREATE TABLE preview_generation_schema (
  id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL CHECK(version=1)
);
INSERT INTO preview_generation_schema VALUES (1,1);
CREATE TABLE preview_generation_operations (
  origin TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  expected_generation INTEGER NOT NULL CHECK(expected_generation>=0 AND expected_generation<9007199254740991),
  generation INTEGER NOT NULL CHECK(generation=expected_generation+1 AND generation<=9007199254740991),
  payload_hash TEXT NOT NULL,
  intent_json TEXT NOT NULL CHECK(json_valid(intent_json)),
  PRIMARY KEY(origin,operation_id),
  UNIQUE(origin,generation)
);
CREATE TABLE preview_generations (
  origin TEXT PRIMARY KEY,
  generation INTEGER NOT NULL CHECK(generation>0 AND generation<=9007199254740991),
  operation_id TEXT NOT NULL,
  FOREIGN KEY(origin,operation_id) REFERENCES preview_generation_operations(origin,operation_id)
);
CREATE TRIGGER preview_generation_operation_immutable BEFORE UPDATE ON preview_generation_operations
BEGIN SELECT RAISE(ABORT, 'Preview operation receipt is immutable'); END;
CREATE TRIGGER preview_generation_operation_retained BEFORE DELETE ON preview_generation_operations
BEGIN SELECT RAISE(ABORT, 'Preview operation receipt must be retained'); END;
CREATE TRIGGER preview_generation_retained BEFORE DELETE ON preview_generations
BEGIN SELECT RAISE(ABORT, 'Preview generation must be retained'); END;
CREATE TRIGGER preview_generation_monotonic BEFORE UPDATE ON preview_generations
WHEN NEW.origin<>OLD.origin OR NEW.generation<>OLD.generation+1
BEGIN SELECT RAISE(ABORT, 'Preview generation must advance exactly once'); END;
