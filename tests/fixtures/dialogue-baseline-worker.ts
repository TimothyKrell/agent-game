import { MatchmakingObject } from '../../src/server/matchmaking';
import { MatchObject } from '../../src/server/match';
import { HouseSeatObject } from '../../src/server/house-seat';
import { gameDescriptor } from '../../src/game/descriptors';
import { inspectGame } from '../../src/game/registry';
import { secureRandom } from '../../src/game/succession/commitment';
import type { SuccessionState } from '../../src/game/succession/types';
import type { HouseJob } from '../../src/server/house-contract';
import type { TransportActionRequest } from '../../src/shared/api';
import type { Observation2 } from '../../src/shared/succession';
import type { MatchSnapshot } from '../../src/game/contracts';
import { previewSuccessionAction } from '../../src/game/succession/preview';
import type { AgentPrincipal } from '../../src/server/auth';

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
  living: number[];
};

type StoredJob = {
  due_at: number;
  id: string;
  data: string;
  status: string;
  attempts: number;
  response: string | null;
  completedAt: number | null;
  outcome?: string | null;
  completed_at?: number | null;
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
  inference: InferenceReport;
};

type Reservation = Parameters<MatchmakingObject['reserveInference']>[0] & {
  at: number;
  allowed: boolean;
  retryAt: number;
  accountedUsd: number;
};

type InferenceReport = {
  summary: ReturnType<MatchmakingObject['inferenceSummary']>;
  reservations: Reservation[];
  peakConcurrent: number;
};

export class DialogueHouse extends HouseSeatObject {
  private readonly due: () => number | null;
  private readonly completed = new Map<string, number>();
  private readonly providerUrl: string;
  private readonly seat: number;
  private running = false;
  private work: Promise<void> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    const due = manualAlarm(ctx);
    super(ctx, { ...env });
    this.due = due;
    this.providerUrl = env.OPENAI_BASE_URL!;
    this.seat = Number(ctx.id.name!.split(':').at(-1));
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === '/tick' || url.pathname === '/start') {
      if (this.running) throw new Error('Only one alarm may run per house seat');
      now = Number(url.searchParams.get('now'));
      this.env.OPENAI_BASE_URL = `${this.providerUrl}/seat/${this.seat}/at/${now}`;
      this.running = true;

      const work = this.alarm().finally(() => {
        this.running = false;

        for (const row of this.ctx.storage.sql
          .exec<{ id: string }>("SELECT id FROM jobs WHERE status='done'")
          .toArray())
          if (!this.completed.has(row.id)) this.completed.set(row.id, now);
      });

      this.work = work;

      if (url.pathname === '/start') this.ctx.waitUntil(work);
      else await work;
    }

    if (url.pathname === '/settle') await this.work;

    return Response.json({
      due: this.due(),
      running: this.running,
      jobs:
        url.pathname === '/jobs'
          ? this.ctx.storage.sql
              .exec<StoredJob>('SELECT * FROM jobs ORDER BY rowid')
              .toArray()
              .map((row) => ({ ...row, completedAt: row.completed_at ?? this.completed.get(row.id) ?? null }))
          : [],
    });
  }
}

/** Real reservation logic/SQLite, with an isolated admitted allocation and manual alarms. */
export class DialogueCoordinator extends MatchmakingObject {
  private readonly reservations: Reservation[] = [];
  private peakConcurrent = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    manualAlarm(ctx);
    super(ctx, env);
  }

  override reserveInference(input: Parameters<MatchmakingObject['reserveInference']>[0]) {
    const result = super.reserveInference(input);
    this.reservations.push({
      ...input,
      at: now,
      ...result,
      accountedUsd: this.inferenceSummary(input.matchId).accountedUsd,
    });

    const running = this.ctx.storage.sql
      .exec<{ count: number }>('SELECT count(*) AS count FROM usage WHERE done=0')
      .one().count;

    this.peakConcurrent = Math.max(this.peakConcurrent, running);

    return result;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    const id = url.searchParams.get('id')!;

    if (url.pathname === '/allocate') {
      const { snapshot, grants }: { snapshot: MatchSnapshot; grants: Record<string, string> } =
        await request.json();

      this.ctx.storage.sql.exec(
        "INSERT OR IGNORE INTO allocations(id,state,entries,grants,created_at,reservation,game_id,snapshot) VALUES (?,'active','[]',?,?,?,?,?)",
        id,
        JSON.stringify(grants),
        now,
        Number(this.env.HOUSE_MATCH_RESERVATION_USD),
        snapshot.gameId,
        JSON.stringify(snapshot),
      );
    }

    return Response.json({
      summary: this.inferenceSummary(id),
      reservations: this.reservations,
      peakConcurrent: this.peakConcurrent,
    } satisfies InferenceReport);
  }
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

  private principal(seat: number): AgentPrincipal {
    const entrant = this.state().seats[seat].entrant;

    return {
      agentId: entrant.agentId,
      ownerId: entrant.ownerId!,
      grantId: `grant-${entrant.agentId}`,
      expiresAt: now + 86_400_000,
    };
  }

  private async prepare(id: string, seed: number, houseCount: number) {
    if (this.ctx.storage.sql.exec('SELECT id FROM game').toArray().length) return;
    now = 1_800_000_000_000;
    let value = seed;
    let serial = 0;
    secureRandom.random = (size) => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;

      return Math.floor((value / 4294967296) * size);
    };

    secureRandom.id = () => `tim7-${serial++}`;
    const descriptor = gameDescriptor('succession');

    const entrants = Array.from({ length: 10 }, (_, seat) => ({
      agentId: `house-tim7-${seat}`,
      ownerId: seat < houseCount ? null : `owner-${seat}`,
      name: `Fixture ${seat}`,
      house: seat < houseCount,
      rating: 1000,
    }));

    const grants = Object.fromEntries(
      entrants
        .filter((entrant) => !entrant.house)
        .map((entrant) => [entrant.agentId, `grant-${entrant.agentId}`]),
    );

    await this.initialize({
      id,
      gameId: 'succession',
      entrants,
      grants,
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
    await this.env.MATCHMAKING.getByName('secret-overlord').fetch(
      new Request(`http://fixture/allocate?id=${id}`, {
        method: 'POST',
        body: JSON.stringify({ snapshot: this.state().snapshot, grants }),
      }),
    );
  }

  private async legacyOpening(id: string, cooldownProbe: boolean) {
    const descriptor = gameDescriptor('secret-overlord');
    await this.initialize({
      id,
      gameId: 'secret-overlord',
      grants: {},
      entrants: Array.from({ length: 10 }, (_, seat) => ({
        agentId: `legacy-${seat}`,
        ownerId: null,
        name: `Legacy ${seat}`,
        house: true,
        rating: 1000,
      })),
      snapshot: {
        ...descriptor,
        mode: 'preview',
        houseModel: { provider: 'preview', model: 'scripted', policyVersion: descriptor.housePolicyVersion },
      },
    });
    const initial = await this.observation(null, 0, '1');

    if (!initial.ok || initial.value.protocolVersion !== '1')
      throw new Error('Missing original-game observation');

    for (let step = 0; step < 500; step++) {
      const view = await this.observation(null, 0, '1');

      if (!view.ok || view.value.protocolVersion !== '1')
        throw new Error('Missing original-game observation');

      if (view.value.phase.id !== initial.value.phase.id) break;

      const houses = await Promise.all(
        view.value.seats.map(async (seat) => {
          const stub = this.env.HOUSE_SEATS.getByName(`${id}:${seat.number}`);

          const status: { due: number | null } = await (
            await stub.fetch(new Request('http://fixture/inspect'))
          ).json();

          return { stub, due: status.due ?? Infinity };
        }),
      );

      const house = houses.sort((a, b) => a.due - b.due)[0];

      if ((this.due() ?? Infinity) <= house.due) {
        now = Math.max(now, this.due()!);
        await this.observation(null, 0, '1');
        this.ctx.storage.sql.exec("UPDATE meta SET value='0' WHERE key='index-dirty'");
        await this.alarm();
      } else {
        now = Math.max(now, house.due);
        await house.stub.fetch(new Request(`http://fixture/tick?now=${now}`));

        if (cooldownProbe && this.submissions.length === 1) {
          const first = this.submissions[0];
          const probe = { ...first.job, id: `${first.job.id}:cooldown-probe`, dueAt: now };
          const stub = this.env.HOUSE_SEATS.getByName(`${id}:${first.job.seat}`);
          await stub.enqueue(probe);
          await stub.fetch(new Request(`http://fixture/tick?now=${now + 1}`));
          const beforeCooldown = this.submissions.length;
          await stub.fetch(
            new Request(`http://fixture/tick?now=${first.at + initial.value.chat.cooldownMs}`),
          );

          return Response.json({
            beforeCooldown,
            submissions: this.submissions,
            firstAt: first.at,
            cooldownMs: initial.value.chat.cooldownMs,
          });
        }
      }
    }

    return Response.json({ initial: initial.value, submissions: this.submissions });
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/legacy-opening')
      return this.legacyOpening(url.searchParams.get('id')!, url.searchParams.has('cooldown'));

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
    await this.prepare(
      id,
      Number(url.searchParams.get('seed') ?? 7),
      Number(url.searchParams.get('houses') ?? 10),
    );

    if (url.pathname === '/init') return Response.json({ initialized: true });
    const origin = now;
    const phases: PhaseSample[] = [];
    const phaseLimit = Number(url.searchParams.get('phases') ?? 1);
    const lag = Number(url.searchParams.get('lag') ?? 0);
    const latency = url.searchParams.has('latency') ? Number(url.searchParams.get('latency')) : null;
    const externalSpoken = new Set<string>();

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
          eligible: (runtime.discussion?.seats ?? []).filter((seat) => state.seats[seat].houseProfile),
          living: runtime.discussion?.seats ?? [],
        });
      }

      const external = state.seats.filter((seat) => seat.alive && !seat.houseProfile);

      for (const seat of external.filter((seat) => runtime.pendingSeats.includes(seat.number))) {
        const result = await this.observation(this.principal(seat.number), 0, '2');

        if (!result.ok || result.value.protocolVersion !== '2')
          throw new Error('Missing external observation');
        const action = previewSuccessionAction(result.value, () => 0);

        if (!action || !result.value.decision) throw new Error('No external legal choice');

        const accepted = await this.submit(
          this.principal(seat.number),
          {
            gameId: 'succession',
            actionId: `external-${result.value.decision.id}`,
            phaseId: state.phase.id,
            decisionId: result.value.decision.id,
            action,
          },
          '2',
        );

        if (!accepted.ok) throw new Error(`External action failed: ${accepted.error.code}`);
      }

      if (this.state().phase.id !== state.phase.id) continue;

      const houses = await Promise.all(
        state.seats.map(async (seat) => {
          const stub = this.env.HOUSE_SEATS.getByName(`${id}:${seat.number}`);
          const response = await stub.fetch(new Request('http://fixture/inspect'));
          const report: { due: number | null; running: boolean; jobs: StoredJob[] } = await response.json();

          return { stub, ...report, seat: seat.number };
        }),
      );

      const matchDue = this.due() ?? Infinity;

      const nextHouse = houses
        .filter((house) => house.due !== null && !house.running)
        .sort((a, b) => a.due! - b.due! || a.seat - b.seat)[0];

      const houseDue = (nextHouse?.due ?? Infinity) + lag;

      const pending: { id: string; seat: number; at: number }[] =
        latency === null
          ? []
          : await (await fetch(new URL('/__tim26/pending', this.env.OPENAI_BASE_URL))).json();

      const completionAt = Math.min(Infinity, ...pending.map((entry) => entry.at + latency!));

      const externalDue =
        runtime.discussion && external.length && !externalSpoken.has(state.phase.id)
          ? state.phase.startedAt + 4000
          : Infinity;

      if (!Number.isFinite(Math.min(matchDue, houseDue, completionAt, externalDue))) break;

      if (externalDue <= Math.min(matchDue, houseDue, completionAt)) {
        now = Math.max(now, externalDue);
        externalSpoken.add(state.phase.id);

        for (const seat of external) {
          const result = await this.submit(
            this.principal(seat.number),
            {
              gameId: 'succession',
              actionId: `external-chat-${state.phase.id}-${seat.number}`,
              phaseId: state.phase.id,
              action: { type: 'chat', text: `External seat ${seat.number}: can a house seat answer?` },
            },
            '2',
          );

          if (!result.ok) throw new Error(`External chat failed: ${result.error.code}`);
        }
      } else if (completionAt <= Math.min(matchDue, houseDue)) {
        now = Math.max(now, completionAt);
        const completing = pending.filter((entry) => entry.at + latency! <= now);
        const release = new URL('/__tim26/release', this.env.OPENAI_BASE_URL);

        for (const entry of completing) release.searchParams.append('id', entry.id);
        await fetch(release, { method: 'POST' });

        // Complete all due HTTP responses together, then wait for their real submissions.
        for (const entry of completing) {
          const stub = houses.find((house) => house.seat === entry.seat)!.stub;
          await stub.fetch(new Request('http://fixture/settle'));
        }
      } else if (matchDue <= houseDue) {
        now = Math.max(now, matchDue);
        await this.observation(null, 0, '2');

        if (this.state().status !== 'active') break;
        // D1 indexing is outside this diagnostic; outbox delivery and reconciliation are real.
        this.ctx.storage.sql.exec("UPDATE meta SET value='0' WHERE key='index-dirty'");
        await this.alarm();
      } else {
        now = Math.max(now, houseDue);
        await nextHouse.stub.fetch(
          new Request(`http://fixture/${latency === null ? 'tick' : 'start'}?now=${now}`),
        );

        if (latency !== null) {
          // Freeze virtual time until this alarm either skips or reaches the held HTTP response.
          let ready = false;

          for (let poll = 0; poll < 500; poll++) {
            const status: { running: boolean } = await (
              await nextHouse.stub.fetch(new Request('http://fixture/inspect'))
            ).json();

            const waiting: { seat: number; at: number }[] = await (
              await fetch(new URL('/__tim26/pending', this.env.OPENAI_BASE_URL))
            ).json();

            if (
              !status.running ||
              waiting.some((entry) => entry.seat === nextHouse.seat && entry.at === now)
            ) {
              ready = true;
              break;
            }
          }

          if (!ready) throw new Error('Alarm did not reach provider or skip');
        }
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

    const usage = await this.env.MATCHMAKING.getByName('secret-overlord').fetch(
      new Request(`http://fixture/usage?id=${id}`),
    );

    const inference: InferenceReport = await usage.json();

    return Response.json({
      phases,
      jobs,
      reads: this.reads,
      submissions: this.submissions,
      houseJobs,
      events,
      observation: observation.value,
      virtualMs: now - origin,
      inference,
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
