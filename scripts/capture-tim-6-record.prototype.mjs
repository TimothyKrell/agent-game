/** Read-only TIM-6 design fixture capture. Public completed archive; no credentials or mutations. */
import { writeFile } from 'node:fs/promises';

const origin = 'https://agent-game.tk-d86.workers.dev';

const matchId = 'match_e65fb846-c804-4d8b-ba78-e303119e1847';

const base = `${origin}/api/matches/${matchId}`;

async function get(path) {
  const response = await fetch(path, { headers: { 'X-Agent-Game-Protocols': '1,2' } });

  if (!response.ok) throw new Error(`${response.status}: ${path}`);

  return response.json();
}

const current = await get(base);

if (current.status !== 'finished') throw new Error('This fixture requires a completed match.');

const { visibilityEpoch: epoch, streamHead: through } = current.history;

const events = [];

const pages = [];

let after = 0;

while (after < through) {
  const page = await get(
    `${base}/history?${new URLSearchParams({ epoch, through, after, limit: 64, maxBytes: 32768 })}`,
  );

  if (page.reset || page.after !== after || page.visibilityEpoch !== epoch || page.cursor <= after)
    throw new Error('Archive changed or did not advance.');
  events.push(...page.events);
  pages.push({ after, cursor: page.cursor, count: page.events.length });
  after = page.cursor;
}

const record = {
  source: `${origin}/matches/${matchId}`,
  capturedAt: new Date().toISOString(),
  current,
  pages,
  events,
};

await writeFile(
  new URL('../src/client/succession-replay-record.prototype.json', import.meta.url),
  JSON.stringify(record, null, 2) + '\n',
);

const types = {};

for (const event of events)
  types[`${event.act}:${event.type}`] = (types[`${event.act}:${event.type}`] ?? 0) + 1;

console.log(JSON.stringify({ events: events.length, pages: pages.length, types }, null, 2));
