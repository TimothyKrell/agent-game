-- Trusted controller configuration. No public HTTP mutation route and no copied spending allowance.
CREATE TABLE preview_broker_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  revision TEXT NOT NULL
);
