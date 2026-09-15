-- 0005 is reserved for the independently implemented preview broker.
-- Only the trusted lifecycle controller publishes these immutable byte identities.
CREATE TABLE preview_artifacts (
  origin TEXT NOT NULL,
  incarnation TEXT NOT NULL,
  commit_id TEXT NOT NULL,
  manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
  PRIMARY KEY(origin, incarnation, commit_id)
);
CREATE TRIGGER preview_artifact_immutable BEFORE UPDATE ON preview_artifacts
BEGIN SELECT RAISE(ABORT, 'Preview artifact identity is immutable'); END;
