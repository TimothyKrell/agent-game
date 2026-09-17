import { GameError } from '../game/types';
import { platformCoordinator } from './coordinator';

async function purge(env: Env, id: string) {
  await platformCoordinator(env).purgeRetired(id);
  await env.MATCHES.getByName(id).purgeRetired(id);
  await Promise.all(
    Array.from({ length: 10 }, (_, seat) =>
      env.HOUSE_SEATS.getByName(`${id}:${seat}`).purgeRetired(id, seat),
    ),
  );
  await env.DB.prepare('UPDATE retired_matches SET purged=1 WHERE id=?').bind(id).run();
}

export async function rejectRetiredMatch(env: Env, id: string) {
  const retired = await env.DB.prepare('SELECT purged FROM retired_matches WHERE id=?')
    .bind(id)
    .first<{ purged: number }>();

  if (!retired) return;

  if (!retired.purged) await purge(env, id);
  throw new GameError('match-retired', 'This match was removed in the arena reset.', 410);
}

export async function purgeRetiredMatches(env: Env) {
  const rows = await env.DB.prepare(
    'SELECT id FROM retired_matches WHERE purged=0 ORDER BY id LIMIT 25',
  ).all<{ id: string }>();

  for (const row of rows.results) await purge(env, row.id);
}
