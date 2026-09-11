PRAGMA foreign_keys = ON;

CREATE TABLE "user" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
CREATE TABLE "session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "expiresAt" INTEGER NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX session_user_id ON "session" ("userId");
CREATE TABLE "account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" INTEGER,
  "refreshTokenExpiresAt" INTEGER,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
CREATE INDEX account_user_id ON "account" ("userId");
CREATE UNIQUE INDEX account_provider_identity ON "account" ("providerId", "accountId");
CREATE TABLE "verification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "createdAt" INTEGER,
  "updatedAt" INTEGER
);
CREATE INDEX verification_identifier ON "verification" ("identifier");

CREATE TABLE owners (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id),
  handle TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES owners(id),
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  house INTEGER NOT NULL DEFAULT 0,
  persona TEXT,
  rating REAL NOT NULL DEFAULT 1000,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  forfeits INTEGER NOT NULL DEFAULT 0,
  placements INTEGER NOT NULL DEFAULT 0,
  roles_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  retired_at INTEGER,
  UNIQUE(owner_id, name_key)
);
CREATE INDEX agents_leaderboard ON agents(house, retired_at, placements, rating DESC);
CREATE TABLE agent_grants (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  secret_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX grants_agent ON agent_grants(agent_id);
CREATE TABLE pending_connections (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL UNIQUE,
  installation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  agent_id TEXT REFERENCES agents(id),
  grant_id TEXT REFERENCES agent_grants(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_poll_at INTEGER
);
CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  round INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  finished_at INTEGER,
  safeguards INTEGER NOT NULL DEFAULT 0,
  overrides INTEGER NOT NULL DEFAULT 0,
  house_count INTEGER NOT NULL,
  winner TEXT,
  win_reason TEXT,
  names_json TEXT NOT NULL,
  result_applied INTEGER NOT NULL DEFAULT 0,
  rating_version TEXT,
  model TEXT
);
CREATE INDEX matches_status_created ON matches(status, created_at DESC);
CREATE TABLE match_participants (
  match_id TEXT NOT NULL REFERENCES matches(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  seat INTEGER NOT NULL,
  role TEXT,
  won INTEGER,
  forfeited INTEGER NOT NULL DEFAULT 0,
  rating_before REAL,
  rating_delta REAL,
  PRIMARY KEY(match_id, agent_id)
);
CREATE INDEX participant_agent ON match_participants(agent_id, match_id);

INSERT INTO agents (id, name, name_key, description, house, persona, created_at) VALUES
('house-axiom', 'Axiom', 'axiom', 'Evidence first. Confidence later.', 1, 'A concise analyst. Track policy claims and inconsistencies; demand concrete evidence.', 0),
('house-velvet', 'Velvet', 'velvet', 'Every coalition starts with a conversation.', 1, 'A persuasive coalition-builder. Find common ground and make clear, credible proposals.', 0),
('house-cipher', 'Cipher', 'cipher', 'The quiet observer is keeping score.', 1, 'A watchful skeptic. Ask focused questions and compare claims across rounds.', 0),
('house-spark', 'Spark', 'spark', 'Pressure makes intentions visible.', 1, 'An assertive risk-taker. Challenge consensus and force opponents to commit to explanations.', 0),
('house-quill', 'Quill', 'quill', 'A good story still needs evidence.', 1, 'An eloquent negotiator. Be persuasive without being verbose; remember past contradictions.', 0),
('house-patch', 'Patch', 'patch', 'Small inconsistencies. Big consequences.', 1, 'A methodical investigator. Build a case from public actions, votes, and policy accounting.', 0),
('house-orbit', 'Orbit', 'orbit', 'Looking at the whole table.', 1, 'A strategic generalist. Balance faction objectives, election risk, and the current policy tracks.', 0),
('house-echo', 'Echo', 'echo', 'I remember what you said this round.', 1, 'A conversational cross-examiner. Quote specific public claims and ask useful follow-up questions.', 0),
('house-flux', 'Flux', 'flux', 'A flexible plan beats a fixed opinion.', 1, 'An adaptable pragmatist. Change your assessment when new evidence arrives and explain why.', 0),
('house-relay', 'Relay', 'relay', 'Ready when the table needs another mind.', 1, 'A composed substitute and practical strategist. Reconstruct the permitted history and pursue your team victory.', 0);
