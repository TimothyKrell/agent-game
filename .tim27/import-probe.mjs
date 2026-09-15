import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile } from 'node:fs/promises';

// Exercises insert-only metadata import against the REAL two application migrations.
// This is a SQL feasibility model, not a production importer or remote D1 test.
const source = new DatabaseSync(':memory:');

const target = new DatabaseSync(':memory:');

const origin = 'https://source.example';

for (const db of [source, target]) {
  for (const name of ['0001_initial.sql', '0002_games.sql'])
    db.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
}

source.exec(`
  INSERT INTO user VALUES ('u-source','Source Owner','fixture@example.test',1,NULL,0,0);
  INSERT INTO owners VALUES ('owner-stable','u-source','source-owner','Source Owner',0);
  INSERT INTO agents(id,owner_id,name,name_key,description,rating,games,created_at)
    VALUES ('agent-stable','owner-stable','Orbit Test','orbit test','Source description',1400,20,0);
  INSERT INTO agent_game_stats(agent_id,game_id,rating_pool_id,rating,games)
    VALUES ('agent-stable','succession','succession-1',1500,10);
  INSERT INTO agent_grants VALUES ('source-grant','agent-stable','fixture-secret-hash','Source installation',0,9999999999999,NULL);
  INSERT INTO session VALUES ('source-session',9999999999999,'fixture-session-token',0,0,NULL,NULL,'u-source');
  INSERT INTO matches(id,status,mode,created_at,house_count,names_json)
    VALUES ('match-source','active','ranked',0,9,'[]');
`);

target.exec(`CREATE TABLE preview_sources (
  source_origin TEXT NOT NULL, kind TEXT NOT NULL, source_id TEXT NOT NULL,
  local_id TEXT NOT NULL, PRIMARY KEY(source_origin,kind,source_id), UNIQUE(kind,local_id)
)`);

function snapshot() {
  return {
    schemaVersion: 1,
    sourceOrigin: origin,
    owner: source.prepare('SELECT id,handle,name FROM owners WHERE id=?').get('owner-stable'),
    agents: source
      .prepare('SELECT id,owner_id,name,name_key,description FROM agents WHERE owner_id=?')
      .all('owner-stable'),
  };
}

function importMetadata(data) {
  target.exec('BEGIN');

  try {
    const localUser = `preview-user-${data.owner.id}`;
    target
      .prepare('INSERT INTO user VALUES (?,?,?,0,NULL,0,0) ON CONFLICT(id) DO NOTHING')
      .run(localUser, data.owner.name, `${localUser}@preview.agent-game.invalid`);
    target
      .prepare('INSERT INTO owners VALUES (?,?,?,?,0) ON CONFLICT(id) DO NOTHING')
      .run(data.owner.id, localUser, data.owner.handle, data.owner.name);
    target
      .prepare('INSERT INTO preview_sources VALUES (?,?,?,?) ON CONFLICT DO NOTHING')
      .run(data.sourceOrigin, 'owner', data.owner.id, data.owner.id);

    for (const agent of data.agents) {
      target
        .prepare(
          `INSERT INTO agents(id,owner_id,name,name_key,description,created_at)
        VALUES (?,?,?,?,?,0) ON CONFLICT(id) DO NOTHING`,
        )
        .run(agent.id, agent.owner_id, agent.name, agent.name_key, agent.description);
      target
        .prepare('INSERT INTO preview_sources VALUES (?,?,?,?) ON CONFLICT DO NOTHING')
        .run(data.sourceOrigin, 'agent', agent.id, agent.id);
    }

    target.exec('COMMIT');
  } catch (error) {
    target.exec('ROLLBACK');
    throw error;
  }
}

const initial = snapshot();

importMetadata(initial);

importMetadata(initial);

assert.equal(target.prepare('SELECT count(*) AS n FROM owners').get().n, 1);

assert.equal(target.prepare('SELECT count(*) AS n FROM preview_sources').get().n, 2);

const imported = target.prepare('SELECT * FROM agents WHERE id=?').get('agent-stable');

assert.equal(imported.rating, 1000);

assert.equal(imported.games, 0);

for (const table of [
  'session',
  'account',
  'agent_grants',
  'pending_connections',
  'matches',
  'agent_game_stats',
])
  assert.equal(target.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);

target.exec(`UPDATE agents SET name='Local Name',name_key='local name',description='Local edit',rating=1123 WHERE id='agent-stable';
  UPDATE owners SET name='Local Owner' WHERE id='owner-stable';`);

source.exec(`UPDATE agents SET name='New Source Name',name_key='new source name',description='New source edit' WHERE id='agent-stable';
  INSERT INTO agents(id,owner_id,name,name_key,created_at) VALUES ('agent-second','owner-stable','Second','second',1);`);

importMetadata(snapshot());

const edited = target.prepare('SELECT name,description,rating FROM agents WHERE id=?').get('agent-stable');

assert.deepEqual({ ...edited }, { name: 'Local Name', description: 'Local edit', rating: 1123 });

assert.equal(target.prepare('SELECT name FROM owners').get().name, 'Local Owner');

assert.equal(target.prepare('SELECT count(*) AS n FROM agents WHERE owner_id=?').get('owner-stable').n, 2);

assert.equal(source.prepare('SELECT rating FROM agents WHERE id=?').get('agent-stable').rating, 1400);

assert.equal(source.prepare('SELECT count(*) AS n FROM session').get().n, 1);

assert.equal(source.prepare('SELECT count(*) AS n FROM agent_grants').get().n, 1);

await writeFile(
  new URL('./import-result.json', import.meta.url),
  JSON.stringify(
    {
      runtime: process.version,
      migrations: ['0001_initial.sql', '0002_games.sql'],
      checks: {
        originalOwnerAndAgentIdsPreserved: true,
        repeatImportSingleIdentity: true,
        ratingsAndBothGameStatsNotCopied: true,
        sessionsAccountsGrantsPairingsMatchesNotCopied: true,
        previewEditsAndLocalRatingPreservedOnImport: true,
        newSourceCompetitorImported: true,
        sourceRatingSessionsAndGrantPreserved: true,
      },
      limitations:
        'In-memory SQLite; collisions, hostile snapshots, concurrent D1 batches and source authority synchronization remain implementation gates.',
    },
    null,
    2,
  ) + '\n',
);

source.close();

target.close();

console.log(
  'PASS: real migration compatibility; stable insert-only identity; local edits and ratings isolated.',
);
