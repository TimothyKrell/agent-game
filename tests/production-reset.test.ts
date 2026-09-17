import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';

it('resets match records and scores atomically, preserves identity, and fences late inserts', async () => {
  const db = new DatabaseSync(':memory:');

  try {
    for (const file of (await readdir('migrations')).filter((file) => file.endsWith('.sql')).sort())
      db.exec(await readFile(`migrations/${file}`, 'utf8'));
    db.exec(
      "INSERT INTO matches(id,status,mode,created_at,house_count,names_json) VALUES ('old','finished','ranked',1,10,'[]')",
    );
    db.exec("INSERT INTO match_participants(match_id,agent_id,seat) VALUES ('old','house-axiom',0)");
    db.exec("UPDATE agents SET rating=1234,games=5,wins=2,losses=3,placements=5 WHERE id='house-axiom'");
    db.exec(
      "INSERT INTO agent_game_stats(agent_id,game_id,rating_pool_id,rating,games,wins) VALUES ('house-axiom','coding-finale','coding-finale-1',200,3,1)",
    );

    const identities = db
      .prepare('SELECT id,owner_id,name,description,persona,created_at FROM agents ORDER BY id')
      .all();

    db.exec('BEGIN');
    db.exec(await readFile('scripts/reset-production-games.sql', 'utf8'));
    db.exec('COMMIT');
    expect(
      db.prepare('SELECT id,owner_id,name,description,persona,created_at FROM agents ORDER BY id').all(),
    ).toEqual(identities);
    expect(db.prepare('SELECT count(*) n FROM matches').get()).toMatchObject({ n: 0 });
    expect(db.prepare('SELECT count(*) n FROM match_participants').get()).toMatchObject({ n: 0 });
    expect(db.prepare('SELECT * FROM retired_matches').get()).toMatchObject({ id: 'old', purged: 0 });

    for (const table of ['agents', 'agent_game_stats'])
      expect(
        db
          .prepare(
            `SELECT count(*) n FROM ${table} WHERE rating!=0 OR games!=0 OR wins!=0 OR losses!=0 OR forfeits!=0 OR placements!=0`,
          )
          .get(),
      ).toMatchObject({ n: 0 });
    expect(() =>
      db.exec(
        "INSERT INTO matches(id,status,mode,created_at,house_count,names_json) VALUES ('old','finished','ranked',1,10,'[]')",
      ),
    ).toThrow('match-retired');
    db.exec("INSERT INTO agents(id,name,name_key,created_at) VALUES ('new','New','new',2)");
    expect(db.prepare("SELECT rating FROM agents WHERE id='new'").get()).toMatchObject({ rating: 0 });
  } finally {
    db.close();
  }
});
