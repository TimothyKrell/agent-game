-- Pictures belong to stable competitors, never match controllers or snapshots.
CREATE TABLE agent_pictures (
  agent_id TEXT PRIMARY KEY REFERENCES agents(id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  version TEXT,
  picture_json TEXT NOT NULL
);
CREATE TABLE agent_picture_assets (
  version TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  state TEXT NOT NULL CHECK (state IN ('pending', 'live', 'garbage')),
  expires_at INTEGER NOT NULL,
  collected_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX agent_picture_assets_collection ON agent_picture_assets(state, collected_at, expires_at);
CREATE TABLE agent_picture_operations (
  agent_id TEXT NOT NULL REFERENCES agents(id),
  request_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  attempt_id TEXT NOT NULL UNIQUE,
  result_json TEXT NOT NULL,
  PRIMARY KEY (agent_id, request_id)
);
