import worker from '../../src/server/worker';
import { legacyAdmission, type LegacyAdmissionEnv } from './legacy-admission';
import { MatchObject as ApplicationMatch } from '../../src/server/match';
import { HouseSeatObject as ApplicationHouse } from '../../src/server/house-seat';
import { DEFAULT_TIMING, type MatchState } from '../../src/game/types';
import { pendingSeats } from '../../src/game/engine';
import { agentSession } from '../../src/server/auth';
import type { MatchInitialization } from '../../src/server/coordinator';
import type { HouseJob } from '../../src/server/house-contract';

export class HouseSeatObject extends ApplicationHouse {
  constructor(
    ctx: DurableObjectState,
    private readonly fixtureEnv: Env & { API_HOUSE_DELIVERY_DELAY_MS?: string },
  ) {
    super(ctx, fixtureEnv);
  }
  async enqueue(job: HouseJob) {
    if (job.kind === 'action')
      await new Promise((resolve) =>
        setTimeout(resolve, Number(this.fixtureEnv.API_HOUSE_DELIVERY_DELAY_MS ?? 0)),
      );

    return super.enqueue(job);
  }
  diagnostics() {
    return this.ctx.storage.sql.exec('SELECT id,status,due_at,deadline,attempts FROM jobs').toArray();
  }
}

export class MatchObject extends ApplicationMatch {
  constructor(
    ctx: DurableObjectState,
    private readonly fixtureEnv: Env & { API_RECOVERY_CLOCK?: string },
  ) {
    super(ctx, fixtureEnv);
  }
  initialize(input: MatchInitialization) {
    // Fast discussions need no wall-clock service allowance. Required actions do:
    // shrinking them made transport/SQLite scheduling latency decide test outcomes.
    if (input.snapshot && this.fixtureEnv.API_RECOVERY_CLOCK !== 'true')
      input = {
        ...input,
        snapshot: {
          ...input.snapshot,
          timing: { ...input.snapshot.timing, action: DEFAULT_TIMING.action, grace: DEFAULT_TIMING.grace },
        },
      };

    return super.initialize(input);
  }
  async abandon(agentId: string) {
    const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM game WHERE id=1').one();
    const state: MatchState = JSON.parse(row.data);
    const pending = pendingSeats(state);

    if (state.phase.deadline === null || state.phase.kind.includes('discussion') || pending.length !== 1)
      return;
    const seat = state.seats[pending[0]];

    if (seat.entrant.agentId !== agentId || seat.houseProfile) return;
    state.phase.deadline = Date.now() - state.timing.grace - 1;
    this.ctx.storage.sql.exec('UPDATE game SET data=? WHERE id=1', JSON.stringify(state));
    this.ctx.storage.sql.exec(
      "INSERT INTO meta(key,value) VALUES ('alarm-due',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      String(Date.now()),
    );
    await this.observation(null, 0, '1');
  }
  diagnostics() {
    const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM game WHERE id=1').one();
    const state: MatchState = JSON.parse(row.data);

    return {
      now: Date.now(),
      matchId: state.id,
      phase: state.phase,
      timing: state.timing,
      winReason: state.winReason,
      seats: state.seats.map((seat) => ({
        number: seat.number,
        generation: seat.generation,
        forfeited: seat.forfeited,
        house: !!seat.houseProfile,
      })),
      events: this.ctx.storage.sql
        .exec<{ data: string }>('SELECT data FROM events ORDER BY id')
        .toArray()
        .map((row): MatchState['events'][number] => JSON.parse(row.data))
        .filter((event) => ['interrupted', 'takeover', 'recovered'].includes(event.type)),
      outbox: this.ctx.storage.sql
        .exec<{ data: string; delivered: number }>('SELECT data,delivered FROM outbox')
        .toArray()
        .map((row) => {
          const job: HouseJob = JSON.parse(row.data);

          return {
            id: job.id,
            seat: job.seat,
            kind: job.kind,
            dueAt: job.dueAt,
            deadline: job.deadline,
            phaseId: job.phaseId,
            delivered: row.delivered,
          };
        }),
    };
  }
}

type ApiEnv = Omit<LegacyAdmissionEnv, 'MATCHES' | 'HOUSE_SEATS'> & {
  MATCHES: DurableObjectNamespace<MatchObject>;
  HOUSE_SEATS: DurableObjectNamespace<HouseSeatObject>;
};

export { MatchmakingObject } from './legacy-admission';

export default {
  async fetch(request: Request<unknown, IncomingRequestCfProperties>, env: ApiEnv) {
    const path = new URL(request.url).pathname;

    if (path === '/__fixture/legacy-health') return Response.json({ historicalAdmission: true });

    if (path === '/__fixture/legacy-ticket' && request.method === 'POST')
      return legacyAdmission(request, env);

    const diagnostics = path.match(/^\/__fixture\/diagnostics\/(match_[\w-]+)$/);

    if (diagnostics)
      return Response.json({
        match: await env.MATCHES.getByName(diagnostics[1]).diagnostics(),
        runners: await Promise.all(
          Array.from({ length: 10 }, (_, seat) =>
            env.HOUSE_SEATS.getByName(`${diagnostics[1]}:${seat}`).diagnostics(),
          ),
        ),
      });

    const abandon = path.match(/^\/__fixture\/abandon\/(match_[\w-]+)$/);

    if (abandon && request.method === 'POST') {
      const principal = await agentSession(request, env);
      await env.MATCHES.getByName(abandon[1]).abandon(principal.agentId);

      return Response.json({ checked: true });
    }

    return worker.fetch(request, env);
  },
} satisfies ExportedHandler<ApiEnv>;
