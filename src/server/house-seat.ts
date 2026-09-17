import { DurableObject } from 'cloudflare:workers';
import type { HouseJob } from './house-contract';
import { HouseSeatRunner } from './house-runner';
import { GameError } from '../game/types';

/** Cloudflare lifecycle boundary; all durable job state remains in this object's SQLite storage. */
export class HouseSeatObject extends DurableObject<Env> {
  private readonly runner: HouseSeatRunner;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.runner = new HouseSeatRunner(ctx, env);
  }

  enqueue(job: HouseJob): Promise<void> {
    return this.runner.enqueue(job);
  }

  alarm(): Promise<void> {
    return this.runner.alarm();
  }

  async purgeRetired(matchId: string, seat: number): Promise<void> {
    if (
      this.ctx.id.toString() !== this.env.HOUSE_SEATS.idFromName(`${matchId}:${seat}`).toString() ||
      !(await this.env.DB.prepare('SELECT id FROM retired_matches WHERE id=?').bind(matchId).first())
    )
      throw new GameError('not-retired', 'This match is not eligible for deletion.', 409);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('DELETE FROM jobs');
      this.ctx.storage.sql.exec('DELETE FROM notes');

      for (const table of ['jobs', 'notes'])
        this.ctx.storage.sql.exec(
          `CREATE TRIGGER IF NOT EXISTS retired_${table} BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'match-retired'); END`,
        );
    });
    await this.ctx.storage.deleteAlarm();
  }
}
