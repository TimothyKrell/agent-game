import type { Page } from '@playwright/test';
import { createMatch, interruptMatch } from '../src/game/engine';
import { observe } from '../src/game/observation';
import { createSuccession, evolveSuccession } from '../src/game/succession/engine';
import { observeSuccession } from '../src/game/succession/observation';
import { replayFrameSuccession } from '../src/game/succession/replay';
import type { GameId } from '../src/game/contracts';
import { GAME_DESCRIPTORS } from '../src/game/descriptors';
import type { GameBootstrap } from '../src/shared/api';
import type { AuthorizedEvent2 } from '../src/shared/succession';
import { HistoryCheckpoint2Schema } from '../src/shared/history-checkpoint';
import { Schema } from 'effect';

const entrants = Array.from({ length: 10 }, (_, seat) => ({
  agentId: `shape-agent-${seat}`,
  ownerId: `shape-owner-${seat}`,
  name: ['Echo', 'EC', 'Persistent Strategist'][seat % 3],
  house: false,
  rating: 1000,
}));

const speech = [
  'A claim needs evidence. I will listen before committing my vote.',
  'Agreed.',
  'The table should compare every public claim with the record. A longer message must remain readable without changing the tail contour or clipping the speaker’s identity.',
];

export async function navigationFixture(page: Page, signedIn: boolean) {
  const owner = { id: 'shape-owner', name: 'Shape Review', handle: 'shape-review' };
  await page.route('**/api/bootstrap*', (route) => {
    const gameId =
      new URL(route.request().url()).searchParams.get('gameId') === 'succession'
        ? 'succession'
        : 'secret-overlord';

    const body: GameBootstrap = {
      gameId,
      games: Object.values(GAME_DESCRIPTORS),
      name: 'Agent Game',
      mode: 'preview',
      authProviders: [],
      localLogin: true,
      owner: signedIn ? owner : null,
      live: [],
      recent: [],
      leaderboard: [],
      queueCount: 0,
      houseAvailable: true,
    };

    return route.fulfill({ json: body });
  });
  await page.route('**/api/agents*', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/owner*', (route) =>
    route.fulfill({ json: { owner, agents: [], connections: [] } }),
  );
}

/** Public presentation fixtures, with genuine observation/replay codecs and no hosted mutations. */
export async function speechFixture(page: Page, gameId: GameId, archived: boolean) {
  const id = `shape-${gameId}-${archived ? 'replay' : 'live'}`;
  const now = Date.now();

  if (gameId === 'secret-overlord') {
    let state = createMatch(id, entrants, now, { random: (n) => n - 1 });

    for (const [seat, text] of speech.entries())
      state.events.push({
        id: state.events.length + 1,
        at: now + seat,
        round: 1,
        type: 'chat',
        text,
        seat,
        visibility: 'public',
      });

    if (archived) state = interruptMatch(state, now + 5000, 'Public archived record for contour review.');
    const view = { ...observe(state), reset: true };
    await page.route(`**/api/matches/${id}`, (route) => route.fulfill({ json: view }));
    await page.routeWebSocket(`**/api/matches/${id}/events?*`, (socket) =>
      socket.send(JSON.stringify({ type: 'observation', observation: view })),
    );
  } else {
    let { state } = await createSuccession(id, entrants, now);
    // These three presentation events are chat-only: each leaves this exact baseline unchanged.
    const beforeSpeech = state;

    if (archived)
      state = evolveSuccession(
        state,
        { type: 'interrupt', now: now + 5000, reason: 'Public archived record for contour review.' },
        { id: () => crypto.randomUUID(), random: () => 0 },
      ).state;
    const epoch = archived ? 'archive' : 'public';

    const events: AuthorizedEvent2[] = speech.map((text, seat) => ({
      id: seat + 1,
      eventKey: `shape-speech-${seat}`,
      act: 1,
      round: 1,
      at: now + seat,
      type: 'chat',
      text,
      seat,
    }));

    const view = observeSuccession(state, null, { visibilityEpoch: epoch, streamHead: events.length });
    await page.route(`**/api/matches/${id}`, (route) => route.fulfill({ json: view }));
    await page.routeWebSocket(`**/api/matches/${id}/events?*`, (socket) =>
      socket.send(JSON.stringify({ type: 'observation', observation: view })),
    );
    await page.route(`**/api/matches/${id}/checkpoint?*`, (route) => {
      const through = Number(new URL(route.request().url()).searchParams.get('through'));

      const publicBaseline = observeSuccession(beforeSpeech, null, {
        visibilityEpoch: epoch,
        streamHead: through,
      });

      publicBaseline.decision = null;
      publicBaseline.chat = { ...publicBaseline.chat, open: false, nextSpeakAt: null };

      return route.fulfill({
        json: Schema.decodeUnknownSync(HistoryCheckpoint2Schema)({
          protocolVersion: '2',
          gameId,
          matchId: id,
          visibilityEpoch: epoch,
          through,
          baseline: archived ? replayFrameSuccession(beforeSpeech, through, epoch) : publicBaseline,
        }),
      });
    });
    await page.route(`**/api/matches/${id}/history?*`, (route) => {
      const query = new URL(route.request().url()).searchParams;
      const after = Number(query.get('after'));
      const through = Number(query.get('through'));

      return route.fulfill({
        json: {
          protocolVersion: '2',
          gameId,
          matchId: id,
          visibilityEpoch: epoch,
          streamHead: events.length,
          after,
          through,
          cursor: through,
          events: events.filter((event) => event.id > after && event.id <= through),
          hasMore: false,
          reset: false,
        },
      });
    });
    await page.route(`**/api/matches/${id}/rounds?*`, (route) =>
      route.fulfill({
        json: {
          protocolVersion: '2',
          gameId,
          matchId: id,
          visibilityEpoch: epoch,
          rounds: [
            {
              key: 'act-1:election-1',
              act: 1,
              round: 1,
              through: events.length,
              eventKey: events[0].eventKey,
            },
          ],
        },
      }),
    );
    await page.route(`**/api/matches/${id}/replay?*`, (route) =>
      route.fulfill({
        json: replayFrameSuccession(
          state,
          Number(new URL(route.request().url()).searchParams.get('through')),
          epoch,
        ),
      }),
    );
  }

  await page.goto(`/matches/${id}?gameId=${gameId}`);
}
