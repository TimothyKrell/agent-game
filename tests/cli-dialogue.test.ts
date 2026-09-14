import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { Schema } from 'effect';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { version } from '../package.json';
import { createSuccession, evolveSuccession } from '../src/game/succession/engine';
import { inspectSuccession, observeSuccession } from '../src/game/succession/observation';
import type { SuccessionCommand } from '../src/game/succession/types';
import { MatchHistory } from '../src/server/history';
import {
  ActionRequest2Schema,
  HistoryPage2Schema,
  Observation2Schema,
  type Observation2,
} from '../src/shared/succession';

const run = promisify(execFile);

const claim = 'I oppose this government: ask the nominee to explain their last vote.';

let installation: string;

let bin: string;

beforeAll(async () => {
  installation = await mkdtemp('/tmp/opencode/dialogue-installed-');
  await run(process.execPath, ['scripts/package-cli.mjs']);
  await run('npm', [
    'install',
    '--prefix',
    installation,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--cache',
    '/tmp/opencode/npm-cache',
    resolve(`public/downloads/agent-game-cli-${version}.tgz`),
  ]);
  bin = `${installation}/node_modules/.bin/agent-game`;
});

afterAll(async () => {
  await rm(installation, { recursive: true, force: true });
});

async function fixture(backlog = true) {
  const db = new DatabaseSync(':memory:');

  // Only the SqlStorage host is substituted; entitlement, paging and byte bounds are production code.
  const history: MatchHistory = Reflect.construct(MatchHistory, [
    {
      exec(sql: string, ...bindings: (string | number | null)[]) {
        const rows = db.prepare(sql).all(...bindings);

        return { toArray: () => rows };
      },
    },
  ]);

  let serial = 0;
  const random = { random: () => 0, id: () => `dialogue-${serial++}` };
  history.initialize(random.id);

  const initial = await createSuccession(
    'match_dialogue',
    Array.from({ length: 10 }, (_, seat) => ({
      agentId: `agent-${seat}`,
      ownerId: `owner-${seat}`,
      name: `Seat ${seat}`,
      house: false,
      rating: 1000,
    })),
    0,
    { random, salt: new Uint8Array(32) },
  );

  let state = initial.state;
  history.append(initial.appendedEvents);
  const first = observeSuccession(state);

  if (first.board.act !== 1) throw new Error('Expected Act 1');
  const seat = first.board.coordinator;
  const peers = state.seats.map((entry) => entry.number).filter((entry) => entry !== seat);
  let now = 0;
  const audience = () => ({ seat, house: false, terminal: state.status !== 'active' });
  const view = () => observeSuccession(state, seat, history.metadata(audience()));

  const apply = (command: SuccessionCommand) => {
    const result = evolveSuccession(state, command, random);

    for (const entry of result.state.seats)
      if (entry.forfeited && !state.seats[entry.number].forfeited) history.freezeOriginal(entry.number);
    state = result.state;
    history.append(result.appendedEvents);
  };

  const chat = (speaker: number, text: string) =>
    apply({
      type: 'act',
      seat: speaker,
      generation: state.seats[speaker].generation,
      now,
      request: {
        gameId: 'succession',
        actionId: random.id(),
        phaseId: state.phase.id,
        action: { type: 'chat', text },
      },
    });

  const advance = () => {
    const deadline = inspectSuccession(state).nextDeadline;

    if (deadline === null) throw new Error('Expected timed phase');
    now = deadline;
    apply({ type: 'advance', now });
  };

  const unicode = backlog ? '🜁'.repeat(1000) : 'Please explain your vote.';

  for (let wave = 0; wave < (backlog ? 3 : 0); wave++) {
    now = wave * 5000;

    for (const peer of peers) chat(peer, unicode);
  }

  advance();
  expect(view().decision).not.toBeNull();
  let beforePage: (() => void) | undefined;
  let afterPage: (() => void) | undefined;
  const requests: string[] = [];

  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, 'http://localhost');

    // Local Worker startup may probe listening ports. Only CLI match routes drive this fixture.
    if (
      ![
        `/api/matches/${state.id}`,
        `/api/matches/${state.id}/history`,
        `/api/matches/${state.id}/actions`,
      ].includes(url.pathname)
    ) {
      response.statusCode = 404;
      response.end();

      return;
    }

    try {
      let result;

      if (url.pathname.endsWith('/actions')) {
        let body = '';

        for await (const chunk of request) body += chunk;
        const action = Schema.decodeUnknownSync(ActionRequest2Schema)(JSON.parse(body));
        requests.push(`POST ${action.action.type}`);
        apply({ type: 'act', seat, generation: 0, now, request: action });

        if (action.action.type === 'nominate') {
          for (const peer of peers) chat(peer, peer === peers.at(-1) ? claim : unicode);
        }

        result = { accepted: true, actionId: action.actionId, observation: view() };
      } else if (url.pathname.endsWith('/history')) {
        requests.push(`GET history ${url.search}`);
        const before = beforePage;
        beforePage = undefined;
        before?.();
        result = history.page(state.id, audience(), {
          epoch: url.searchParams.get('epoch') ?? undefined,
          after: Number(url.searchParams.get('after')),
          through: Number(url.searchParams.get('through')),
          limit: Number(url.searchParams.get('limit')),
          maxBytes: Number(url.searchParams.get('maxBytes')),
        });
        const callback = afterPage;
        afterPage = undefined;
        callback?.();
      } else {
        requests.push('GET current');
        result = view();
      }

      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(result));
    } catch (error) {
      response.statusCode = 409;
      response.end(JSON.stringify({ error: { message: String(error) } }));
    }
  });

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Number }))(server.address());
  const directory = await mkdtemp('/tmp/opencode/dialogue-config-');
  const config = `${directory}/connection.json`;
  await writeFile(config, JSON.stringify({ server: `http://127.0.0.1:${address.port}`, matchId: state.id }));
  const outputs: { command: string; output: string }[] = [];

  const cli = async (...args: string[]) => {
    const { stdout } = await run(process.execPath, [bin, ...args, '--config', config], { cwd: installation });
    outputs.push({ command: args.join(' '), output: stdout });

    return JSON.parse(stdout);
  };

  return {
    cli,
    outputs,
    requests,
    advance,
    view,
    get now() {
      return now;
    },
    onPage(callback: () => void) {
      afterPage = callback;
    },
    beforePage(callback: () => void) {
      beforePage = callback;
    },
    interrupt() {
      apply({ type: 'interrupt', now, reason: 'Fixture epoch transition' });
    },
    replace() {
      advance();
      advance();
      advance();
    },
    peerChat() {
      now += 5000;
      chat(peers[0], 'A newer position after the context read.');
    },
    coolingDown() {
      chat(seat, 'An earlier contribution from this controller.');
    },
    saved: async () => JSON.parse(await readFile(config, 'utf8')),
    async close() {
      await new Promise<void>((done) => server.close(() => done()));
      await rm(directory, { recursive: true, force: true });
      db.close();
    },
  };
}

// Executable reading of the skill, not a production controller or a claim about LLM instruction-following.
async function recent(h: Awaited<ReturnType<typeof fixture>>, start: Observation2) {
  const { visibilityEpoch: epoch, streamHead: through } = start.history;
  let after = Math.max(0, through - 10);
  let current = start;
  let pages = 0;
  let ready = !start.decision && start.status === 'active' && !start.you?.forfeited;

  while (ready && after < through && pages < 10) {
    const page = Schema.decodeUnknownSync(HistoryPage2Schema)(
      await h.cli(
        'history',
        '--epoch',
        epoch,
        '--after',
        String(after),
        '--through',
        String(through),
        '--limit',
        '10',
        '--max-bytes',
        '12288',
      ),
    );

    pages++;
    expect(Buffer.byteLength(h.outputs.at(-1)!.output.trim())).toBeLessThanOrEqual(12288);
    current = Schema.decodeUnknownSync(Observation2Schema)(await h.cli('observe'));
    ready =
      !page.reset &&
      !current.decision &&
      current.status === 'active' &&
      !current.you?.forfeited &&
      current.you?.generation === start.you?.generation &&
      current.phase.id === start.phase.id &&
      current.history.visibilityEpoch === epoch &&
      current.history.streamHead === through;

    if (!ready) break;
    expect(page.cursor).toBeGreaterThan(after);
    after = page.cursor;
  }

  return {
    current,
    pages,
    ready:
      ready &&
      after === through &&
      current.chat.open &&
      (current.chat.nextSpeakAt === null || current.chat.nextSpeakAt <= h.now),
  };
}

it.each([false, true])(
  'delivers the relevant permitted claim before optional speech (Unicode backlog=%s)',
  async (backlog) => {
    const h = await fixture(backlog);

    try {
      const observed = Schema.decodeUnknownSync(Observation2Schema)(await h.cli('observe'));
      expect(observed.decision).not.toBeNull();
      const receipt = await h.cli('act', '--choice', '0');
      const current = Schema.decodeUnknownSync(Observation2Schema)(receipt.observation);
      expect(current.decision).toBeNull();
      expect(h.requests).toEqual(['GET current', 'POST nominate']);
      expect(h.outputs.some(({ output }) => output.includes(claim))).toBe(false);
      const order = process.env.TIM25_ORDER ?? 'after';
      let pages = 0;

      if (order === 'one-page') await h.cli('history', '--limit', '10');

      if (order === 'after') {
        const prepared = await recent(h, current);
        expect(prepared.ready).toBe(true);
        pages = prepared.pages;
        expect(pages).toBe(backlog ? 4 : 1);
        expect((await h.saved()).historyWalk).toBeUndefined();
      }

      const deliveredBeforeSay = h.outputs.some(({ output }) => output.includes(claim));
      expect(
        (await h.cli('say', '--text', 'Please explain your position on this government.')).accepted,
      ).toBe(true);

      if (order === 'before') await h.cli('history', '--limit', '10');

      const deliveredPages = h.outputs
        .filter(({ command }) => command.startsWith('history'))
        .map(({ output }) => {
          const page = Schema.decodeUnknownSync(HistoryPage2Schema)(JSON.parse(output));

          return {
            after: page.after,
            cursor: page.cursor,
            through: page.through,
            bytes: Buffer.byteLength(output.trim()),
            events: page.events.map(({ id, eventKey }) => ({ id, eventKey })),
            relevantClaim: page.events.find((event) => event.text === claim)?.text,
          };
        });

      for (const { output } of h.outputs) expect(Buffer.byteLength(output.trim())).toBeLessThan(15500);
      await writeFile(
        resolve('.agent-game', `tim25-${order}-${backlog ? 'unicode' : 'short'}.json`),
        JSON.stringify({ requests: h.requests, outputs: h.outputs }, null, 2),
      );
      console.log(
        JSON.stringify({
          order,
          backlog,
          head: current.history.streamHead,
          pages,
          deliveredBeforeSay,
          requests: h.requests,
          deliveredPages,
          foreground: (await h.saved()).historyWalk,
        }),
      );
      expect(deliveredBeforeSay, 'Relevant entitled claim must reach CLI stdout BEFORE optional speech').toBe(
        true,
      );
    } finally {
      await h.close();
    }
  },
);

it.each(['decision', 'replacement', 'epoch', 'new-chat'])(
  'rechecks %s during a byte-short recent read before any optional speech',
  async (change) => {
    const h = await fixture();

    try {
      await h.cli('observe');
      const { observation } = await h.cli('act', '--choice', '0');
      const start = Schema.decodeUnknownSync(Observation2Schema)(observation);

      if (change === 'epoch') h.beforePage(h.interrupt);
      else if (change === 'decision') h.onPage(h.advance);
      else if (change === 'replacement') h.onPage(h.replace);
      else h.onPage(h.peerChat);
      const prepared = await recent(h, start);
      expect(prepared.ready).toBe(false);
      expect(prepared.pages).toBe(1);
      expect(h.requests.filter((entry) => entry.startsWith('GET history'))).toHaveLength(1);

      if (change === 'decision') {
        expect(prepared.current.decision).not.toBeNull();
        await h.cli('act', '--choice', '0');
        expect(h.requests.at(-1)).toBe('POST vote');
      }

      if (change === 'replacement') {
        expect(prepared.current.you).toMatchObject({ forfeited: true, generation: 1 });
        expect(prepared.current.private).toBeNull();
      }

      if (change === 'epoch') {
        expect(prepared.current.status).toBe('interrupted');
        expect(prepared.current.history.visibilityEpoch).not.toBe(start.history.visibilityEpoch);
        const page = await h.cli('history', '--limit', '10');
        expect(page.after).toBe(0);
        expect(page.reset).toBe(false);
        expect((await h.saved()).historyWalk.cursor).toBe(page.cursor);
      }

      expect(h.requests).not.toContain('POST chat');
    } finally {
      await h.close();
    }
  },
);

it('redelivers recent context on reconnect independently of an already delivered foreground walk', async () => {
  const h = await fixture(false);

  try {
    await h.cli('observe');
    await h.cli('act', '--choice', '0');
    let page = await h.cli('history', '--limit', '10');

    while (page.hasMore) page = await h.cli('history', '--limit', '10');
    const foreground = (await h.saved()).historyWalk;
    expect(foreground.cursor).toBe(h.view().history.streamHead);
    // Each CLI call is a new process. This clears only the simulated new child's output context.
    h.outputs.length = 0;
    const start = Schema.decodeUnknownSync(Observation2Schema)(await h.cli('observe'));
    expect(h.outputs.some(({ output }) => output.includes(claim))).toBe(false);
    expect((await recent(h, start)).ready).toBe(true);
    expect(h.outputs.some(({ output }) => output.includes(claim))).toBe(true);
    expect((await h.saved()).historyWalk).toEqual(foreground);
  } finally {
    await h.close();
  }
});

it.each(['silence', 'cooldown'])('allows optional %s after the required action', async (choice) => {
  const h = await fixture(false);

  try {
    await h.cli('observe');
    await h.cli('act', '--choice', '0');

    if (choice === 'cooldown') h.coolingDown();
    const start = Schema.decodeUnknownSync(Observation2Schema)(await h.cli('observe'));
    const useful = choice !== 'silence';
    const prepared = await recent(h, start);

    if (prepared.ready && useful) await h.cli('say', '--text', 'Please explain.');

    if (choice === 'silence') expect(prepared.ready).toBe(true);
    else {
      expect(start.chat.nextSpeakAt).toBeGreaterThan(h.now);
      expect(prepared.ready).toBe(false);
    }

    expect(h.requests).not.toContain('POST chat');
  } finally {
    await h.close();
  }
});
