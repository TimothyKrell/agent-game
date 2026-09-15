import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

// Read-only source inspection; the retained capture and its fixtures are never rewritten.
const path = 'src/client/succession-replay-record.prototype.json';

const bytes = await readFile(path);

const record = JSON.parse(bytes.toString('utf8'));

const counts = {};

const alive = new Set(Array.from({ length: 10 }, (_, seat) => seat));

const eliminations = [];

for (const event of record.events) {
  counts[event.type] = (counts[event.type] ?? 0) + 1;

  if (event.type !== 'influence-lost' || !event.data.eliminated) continue;
  alive.delete(event.seat);
  eliminations.push({
    eventKey: event.eventKey,
    cursor: event.id,
    seat: event.seat,
    name: record.current.seats.find((seat) => seat.number === event.seat).name,
    remaining: [...alive].map((number) => ({
      number,
      name: record.current.seats.find((seat) => seat.number === number).name,
    })),
  });
}

const sources = [];

for (const file of [
  'src/shared/succession.ts',
  'src/shared/history.ts',
  'src/game/succession/engine.ts',
  'src/game/succession/act2.ts',
  'src/game/succession/replay.ts',
  'src/server/match.ts',
  'src/client/succession-replay-data.ts',
  'src/client/succession-stream.ts',
]) {
  sources.push({
    path: file,
    sha256: createHash('sha256')
      .update(await readFile(file))
      .digest('hex'),
  });
}

await writeFile(
  '.tim18/source-probe.json',
  JSON.stringify(
    {
      capture: {
        path,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        events: record.events.length,
        pages: record.pages.length,
      },
      counts,
      transition: record.events.find((event) => event.type === 'act-started'),
      eliminations,
      sources,
    },
    null,
    2,
  ) + '\n',
);
