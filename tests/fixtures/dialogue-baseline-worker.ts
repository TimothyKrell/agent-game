import { DurableObject } from 'cloudflare:workers';
import { MatchObject } from '../../src/server/match';
import { HouseSeatObject } from '../../src/server/house-seat';
import { gameDescriptor } from '../../src/game/descriptors';
import { inspectGame } from '../../src/game/registry';
import { secureRandom } from '../../src/game/succession/commitment';
import type { SuccessionState } from '../../src/game/succession/types';
import type { HouseJob } from '../../src/server/house-contract';
import type { TransportActionRequest } from '../../src/shared/api';
import type { Observation2 } from '../../src/shared/succession';

// Local-only, single-request driver. No production entrypoint imports this module.
// Native SQLite, real RPC, and application alarms run; the driver owns their wake-up clock.
let now = 1_800_000_000_000;

Date.now = () => now;

function manualAlarm(ctx: DurableObjectState) {
  let due: number | null = null;
  Object.defineProperty(ctx.storage, 'setAlarm', {
    value: async (at: number | Date) => {
      due = Number(at);
    },
  });
  Object.defineProperty(ctx.storage, 'deleteAlarm', {
    value: async () => {
      due = null;
    },
  });

  return () => due;
}

type ContextRead = {
  at: number;
  seat: number;
  phaseId: string;
  open: boolean;
  head: number;
  latestChat: { seat: number; at: number } | null;
  chat: { eventKey: string; seat?: number; at: number; text: string }[];
};

type Submission = {
  at: number;
  job: HouseJob;
  type: string;
  text: string | null;
  ok: boolean;
  error: string | null;
};

export type PhaseSample = {
  act: number;
  phaseId: string;
  kind: string;
  round: number;
  start: number;
  deadline: number | null;
  anchor: number | null;
  eligible: number[];
};

type StoredJob = {
  id: string;
  data: string;
  status: string;
  attempts: number;
  response: string | null;
  completedAt: number | null;
};

export type DialogueTrace = {
  phases: PhaseSample[];
  jobs: HouseJob[];
  reads: ContextRead[];
  submissions: Submission[];
  houseJobs: StoredJob[];
  events: { id: number; eventKey: string; seat?: number; at: number; text: string; type: string }[];
  observation: Observation2;
  virtualMs: number;
};

export class DialogueHouse extends HouseSeatObject {
  private readonly due: () => number | null;
  private readonly completed = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    const due = manualAlarm(ctx);
    super(ctx, env);
    this.due = due;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === '/tick') {
      now = Number(url.searchParams.get('now'));
      await this.alarm();

      for (const row of this.ctx.storage.sql
        .exec<{ id: string }>("SELECT id FROM jobs WHERE status='done'")
        .toArray())
        if (!this.completed.has(row.id)) this.completed.set(row.id, now);
    }

    return Response.json({
      due: this.due(),
      jobs:
        url.pathname === '/jobs'
          ? this.ctx.storage.sql
              .exec<StoredJob>('SELECT id,data,status,attempts,response FROM jobs ORDER BY rowid')
              .toArray()
              .map((row) => ({ ...row, completedAt: this.completed.get(row.id) ?? null }))
          : [],
    });
  }
}

/** Budget/admission deliberately excluded: permits distinguish scheduler absence from denied funding. */
export class DialogueCoordinator extends DurableObject<Env> {
  reserveInference() {
    return { allowed: true };
  }

  recordInference() {}
}

export class DialogueMatch extends MatchObject {
  private readonly due: () => number | null;
  private readonly reads: ContextRead[] = [];
  private readonly submissions: Submission[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    const due = manualAlarm(ctx);
    super(ctx, env);
    this.due = due;
  }

  private state(): SuccessionState {
    return JSON.parse(this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM game').one().data);
  }

  override async houseObservation(seat: number, generation: number, phaseId: string) {
    const input = await super.houseObservation(seat, generation, phaseId);

    if (input?.observation.protocolVersion === '2')
      this.reads.push({
        at: now,
        seat,
        phaseId,
        open: input.observation.chat.open,
        head: input.observation.history.streamHead,
        latestChat: this.state().lastChat,
        chat: input.recent
          .filter((event) => event.type === 'chat')
          .map(({ eventKey, seat, at, text }) => ({ eventKey, seat, at, text })),
      });

    return input;
  }

  override async submitHouse(job: HouseJob, request: TransportActionRequest) {
    const result = await super.submitHouse(job, request);
    this.submissions.push({
      at: now,
      job,
      type: request.action.type,
      text: request.action.type === 'chat' ? request.action.text : null,
      ok: result.ok,
      error: result.ok ? null : result.error.code,
    });

    return result;
  }

  private async prepare(id: string) {
    if (this.ctx.storage.sql.exec('SELECT id FROM game').toArray().length) return;
    now = 1_800_000_000_000;
    let value = 7;
    let serial = 0;
    secureRandom.random = (size) => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;

      return Math.floor((value / 4294967296) * size);
    };

    secureRandom.id = () => `tim7-${serial++}`;
    const descriptor = gameDescriptor('succession');
    await this.initialize({
      id,
      gameId: 'succession',
      entrants: Array.from({ length: 10 }, (_, seat) => ({
        agentId: `house-tim7-${seat}`,
        ownerId: null,
        name: `Fixture ${seat}`,
        house: true,
        rating: 1000,
      })),
      grants: {},
      snapshot: {
        ...descriptor,
        mode: 'evaluation',
        houseModel: {
          provider: 'openai',
          model: 'gpt-4.1-mini',
          policyVersion: descriptor.housePolicyVersion,
        },
      },
    });
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/history') {
      const result = await this.historyPage(
        null,
        {
          epoch: url.searchParams.get('epoch') ?? undefined,
          after: Number(url.searchParams.get('after') ?? 0),
          through: Number(url.searchParams.get('through') ?? 0),
          limit: 32,
          maxBytes: 16_384,
        },
        '2',
      );

      return Response.json(result.ok ? result.value : result.error, { status: result.ok ? 200 : 400 });
    }

    if (url.pathname !== '/run' && url.pathname !== '/init') return super.fetch(request);
    const id = url.searchParams.get('id')!;
    await this.prepare(id);

    if (url.pathname === '/init') return Response.json({ initialized: true });
    const origin = now;
    const phases: PhaseSample[] = [];
    const phaseLimit = Number(url.searchParams.get('phases') ?? 1);
    const lag = Number(url.searchParams.get('lag') ?? 0);

    if (!Number.isInteger(phaseLimit) || phaseLimit < 1 || phaseLimit > 200 || lag < 0 || lag > 30_000)
      throw new Error('Use 1–200 phases and 0–30000ms house-wakeup lag');

    for (let step = 0; step < 10_000; step++) {
      const state = this.state();
      const runtime = inspectGame(state);

      if (phases.at(-1)?.phaseId !== state.phase.id) {
        if (phases.length >= phaseLimit || state.status !== 'active') break;
        phases.push({
          act: state.stage.act,
          phaseId: state.phase.id,
          kind: state.phase.kind,
          round: state.stage.board.round,
          start: state.phase.startedAt,
          deadline: state.phase.deadline,
          anchor: runtime.discussion?.anchor ?? null,
          eligible: runtime.discussion?.seats ?? [],
        });
      }

      const houses = await Promise.all(
        state.seats.map(async (seat) => {
          const stub = this.env.HOUSE_SEATS.getByName(`${id}:${seat.number}`);
          const response = await stub.fetch(new Request('http://fixture/inspect'));
          const report: { due: number | null; jobs: StoredJob[] } = await response.json();

          return { stub, ...report, seat: seat.number };
        }),
      );

      const matchDue = this.due() ?? Infinity;

      const nextHouse = houses
        .filter((house) => house.due !== null)
        .sort((a, b) => a.due! - b.due! || a.seat - b.seat)[0];

      const houseDue = (nextHouse?.due ?? Infinity) + lag;

      if (!Number.isFinite(Math.min(matchDue, houseDue))) break;

      if (matchDue <= houseDue) {
        now = Math.max(now, matchDue);
        await this.observation(null, 0, '2');

        if (this.state().status !== 'active') break;
        // D1 indexing is outside this diagnostic; outbox delivery and reconciliation are real.
        this.ctx.storage.sql.exec("UPDATE meta SET value='0' WHERE key='index-dirty'");
        await this.alarm();
      } else {
        now = Math.max(now, houseDue);
        await nextHouse.stub.fetch(new Request(`http://fixture/tick?now=${now}`));
      }
    }

    if (phases.length < phaseLimit && this.state().status === 'active')
      throw new Error('Driver stopped before its requested checkpoint');

    const houseJobs = (
      await Promise.all(
        this.state().seats.map(async (seat) => {
          const response = await this.env.HOUSE_SEATS.getByName(`${id}:${seat.number}`).fetch(
            new Request('http://fixture/jobs'),
          );

          const report: { jobs: StoredJob[] } = await response.json();

          return report.jobs;
        }),
      )
    ).flat();

    const observation = await this.observation(null, 0, '2');

    if (!observation.ok || observation.value.protocolVersion !== '2') throw new Error('Missing observation');
    const first = await this.historyPage(null, {}, '2');

    if (!first.ok) throw new Error('Missing history metadata');
    const events: DialogueTrace['events'] = [];
    let cursor = 0;

    while (cursor < first.value.streamHead) {
      const page = await this.historyPage(
        null,
        { epoch: first.value.visibilityEpoch, after: cursor, through: first.value.streamHead, limit: 64 },
        '2',
      );

      if (!page.ok || page.value.cursor <= cursor) throw new Error('History did not progress');
      events.push(...page.value.events);
      cursor = page.value.cursor;
    }

    const jobs = this.ctx.storage.sql
      .exec<{ data: string }>('SELECT data FROM outbox ORDER BY rowid')
      .toArray()
      .map((row): HouseJob => JSON.parse(row.data));

    return Response.json({
      phases,
      jobs,
      reads: this.reads,
      submissions: this.submissions,
      houseJobs,
      events,
      observation: observation.value,
      virtualMs: now - origin,
    } satisfies DialogueTrace);
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const id = url.searchParams.get('id') ?? 'match_tim7';
    url.searchParams.set('id', id);

    url.searchParams.set('protocol', '2');

    return env.MATCHES.getByName(id).fetch(
      new Request(`http://fixture${url.pathname}?${url.searchParams}`, request),
    );
  },
};
