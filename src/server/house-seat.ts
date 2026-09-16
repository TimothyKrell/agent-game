import { DurableObject } from 'cloudflare:workers';
import type { HouseJob } from './house-contract';
import { HouseSeatRunner } from './house-runner';

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
}
