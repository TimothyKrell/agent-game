-- TIM-27. Configuration is written only by a trusted lifecycle controller, never public HTTP.
CREATE TABLE preview_runtime (
  id INTEGER PRIMARY KEY CHECK(id=1), incarnation TEXT NOT NULL,
  commit_id TEXT NOT NULL, encrypted_key TEXT NOT NULL
);
CREATE TABLE preview_arenas (
  origin TEXT PRIMARY KEY, incarnation TEXT NOT NULL, commit_id TEXT NOT NULL,
  public_key TEXT NOT NULL, closed_at INTEGER
);
CREATE TABLE preview_retired_arenas (
  origin TEXT NOT NULL, incarnation TEXT NOT NULL, PRIMARY KEY(origin,incarnation)
);
CREATE TRIGGER preview_arena_reinsert BEFORE INSERT ON preview_arenas
WHEN EXISTS(SELECT 1 FROM preview_retired_arenas WHERE origin=NEW.origin AND incarnation=NEW.incarnation)
BEGIN SELECT RAISE(ABORT, 'Retired preview incarnation'); END;
CREATE TRIGGER preview_arena_reopen BEFORE UPDATE ON preview_arenas
WHEN EXISTS(SELECT 1 FROM preview_retired_arenas WHERE origin=NEW.origin AND incarnation=NEW.incarnation)
BEGIN SELECT RAISE(ABORT, 'Retired preview incarnation'); END;
CREATE TRIGGER preview_arena_retire AFTER UPDATE ON preview_arenas
WHEN OLD.incarnation<>NEW.incarnation OR NEW.closed_at IS NOT NULL
BEGIN INSERT OR IGNORE INTO preview_retired_arenas VALUES (OLD.origin,OLD.incarnation); END;
CREATE TRIGGER preview_arena_delete AFTER DELETE ON preview_arenas
BEGIN INSERT OR IGNORE INTO preview_retired_arenas VALUES (OLD.origin,OLD.incarnation); END;
CREATE TABLE preview_nonces (
  arena TEXT NOT NULL, incarnation TEXT NOT NULL, nonce TEXT NOT NULL, expires_at INTEGER NOT NULL,
  PRIMARY KEY(arena,incarnation,nonce)
);
CREATE INDEX preview_nonces_expiry ON preview_nonces(expires_at);
CREATE TABLE preview_handoffs (
  id TEXT PRIMARY KEY, arena TEXT NOT NULL, incarnation TEXT NOT NULL, commit_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('owner','agent')), challenge TEXT NOT NULL,
  token_hash TEXT, owner_id TEXT, agent_id TEXT, session_id TEXT, grant_id TEXT,
  code_hash TEXT, encrypted_code TEXT, expires_at INTEGER NOT NULL,
  authority_expires INTEGER, redeemed_at INTEGER, revoked_at INTEGER
);
CREATE INDEX preview_handoffs_authority ON preview_handoffs(grant_id,session_id);
CREATE TABLE preview_pending (
  id TEXT PRIMARY KEY, incarnation TEXT NOT NULL, commit_id TEXT NOT NULL,
  encrypted_verifier TEXT NOT NULL, browser_hash TEXT NOT NULL, expires_at INTEGER NOT NULL,
  encrypted_token TEXT NOT NULL, session_committed INTEGER NOT NULL DEFAULT 0
);
-- Supported Better Auth additional field ties the library insert to the write-ahead intent.
ALTER TABLE session ADD COLUMN preview_request_id TEXT;
CREATE UNIQUE INDEX session_preview_request ON session(preview_request_id);
CREATE TRIGGER preview_session_insert BEFORE INSERT ON session
WHEN NEW.preview_request_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM preview_pending WHERE id=NEW.preview_request_id AND session_committed=0
)
BEGIN SELECT RAISE(ABORT, 'Preview session already committed or unknown'); END;
CREATE TABLE preview_sources (
  origin TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('owner','agent')), source_id TEXT NOT NULL,
  local_id TEXT NOT NULL, PRIMARY KEY(origin,kind,source_id), UNIQUE(kind,local_id)
);
CREATE TABLE preview_authorities (
  kind TEXT NOT NULL CHECK(kind IN ('session','grant')), local_id TEXT NOT NULL,
  handoff_id TEXT NOT NULL, incarnation TEXT NOT NULL, expires_at INTEGER NOT NULL,
  PRIMARY KEY(kind,local_id)
);
CREATE TABLE preview_imports (
  handoff_id TEXT PRIMARY KEY, scope TEXT NOT NULL, owner_id TEXT NOT NULL,
  agent_id TEXT, expires_at INTEGER NOT NULL, cursor TEXT, complete INTEGER NOT NULL DEFAULT 0
);
