// Only the portrait takeover journey uses this entry. Production actor methods remain authoritative.
import worker from './worker';
import { MatchObject as ApplicationMatch } from '../../../src/server/match';
import { pendingSeats } from '../../../src/game/engine';
import type { MatchState } from '../../../src/game/types';
import { json, readJson } from '../../../src/server/http';
import { Schema } from 'effect';

export { MatchmakingObject, HouseSeatObject } from './worker';

interface DelayedRead {
  decisionId: string;
  startedAt: number;
  completedAt: number | null;
  deadline: number;
}

const ClockInput = Schema.Struct({ phaseId: Schema.String, agentId: Schema.String });

export class MatchObject extends ApplicationMatch {
  private portraitState(): MatchState {
    const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM game WHERE id=1').one();
    const state: MatchState = JSON.parse(row.data);

    if (state.rulesVersion !== 'secret-overlord-1')
      throw new Error('Portrait fixture requires Secret Overlord');

    return state;
  }

  async portraitClock(input: typeof ClockInput.Type) {
    const state = this.portraitState();

    if (state.phase.id !== input.phaseId || state.phase.deadline === null)
      return { advanced: false, reason: 'stale-or-terminal' };

    const discussion = state.phase.kind.includes('discussion');
    const pending = pendingSeats(state);

    const onlyHuman =
      pending.length === 1 &&
      state.seats[pending[0]].entrant.agentId === input.agentId &&
      !state.seats[pending[0]].houseProfile;

    // In particular, never expire a required house action or its replacement window.
    if (!discussion && !onlyHuman) return { advanced: false, reason: 'house-or-no-human-pending' };

    state.phase.deadline = Date.now() - (discussion ? 1 : state.timing.grace + 1);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('UPDATE game SET data=? WHERE id=1', JSON.stringify(state));
      this.ctx.storage.sql.exec(
        "INSERT INTO meta(key,value) VALUES ('alarm-due',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        String(Date.now()),
      );
    });
    // Same explicit expiry seam as succession-worker.fixtureClock: production reconciliation
    // creates the takeover, replacement generation, outbox and its unchanged action allowance.
    const result = await this.observation(null, 0, '1');

    if (!result.ok) throw new Error(result.error.message);

    return { advanced: true, reason: discussion ? 'discussion' : 'human-grace' };
  }

  private delayedRead(): DelayedRead | null {
    const row = this.ctx.storage.sql
      .exec<{ value: string }>("SELECT value FROM meta WHERE key='portrait-delayed-read'")
      .toArray()[0];

    return row ? JSON.parse(row.value) : null;
  }

  private saveDelay(value: DelayedRead) {
    this.ctx.storage.sql.exec(
      "INSERT INTO meta(key,value) VALUES ('portrait-delayed-read',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      JSON.stringify(value),
    );
  }

  async houseObservation(seat: number, generation: number, phaseId: string) {
    const result = await super.houseObservation(seat, generation, phaseId);
    const decision = result?.observation.decision;

    if (generation > 0 && decision && !this.delayedRead()) {
      const delay: DelayedRead = {
        decisionId: decision.id,
        startedAt: Date.now(),
        completedAt: null,
        deadline: decision.graceUntil,
      };

      this.saveDelay(delay);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      this.saveDelay({ ...delay, completedAt: Date.now() });
    }

    return result;
  }

  portraitProgress() {
    const delay = this.delayedRead();

    const receipt = delay
      ? this.ctx.storage.sql
          .exec('SELECT id FROM receipts WHERE id=?', `house:secret-overlord:${delay.decisionId}:action`)
          .toArray()
      : [];

    return {
      timing: this.portraitState().timing,
      delay,
      elapsedMs: delay?.completedAt === null || !delay ? null : delay.completedAt - delay.startedAt,
      accepted: receipt.length === 1,
    };
  }
}

type PortraitEnv = Omit<Env, 'MATCHES'> & { MATCHES: DurableObjectNamespace<MatchObject> };

export default {
  async fetch(request: Request<unknown, IncomingRequestCfProperties>, env: PortraitEnv) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/__probe\/portrait\/(match_[\w-]+)\/(clock|progress)$/);

    if (match) {
      const stub = env.MATCHES.getByName(match[1]);

      if (match[2] === 'progress') return json(await stub.portraitProgress());

      return json(await stub.portraitClock(await readJson(request, ClockInput)));
    }

    return worker.fetch(request, env);
  },
} satisfies ExportedHandler<PortraitEnv>;
