import worker from '../../src/server/worker';
import { legacyAdmission, type LegacyAdmissionEnv } from './legacy-admission';

export { MatchObject, HouseSeatObject } from '../../src/server/worker';

export { MatchmakingObject } from './legacy-admission';

export default {
  async fetch(request: Request<unknown, IncomingRequestCfProperties>, env: LegacyAdmissionEnv) {
    const path = new URL(request.url).pathname;

    if (path === '/__fixture/legacy-health') return Response.json({ historicalAdmission: true });

    if (path === '/__fixture/legacy-ticket' && request.method === 'POST')
      return legacyAdmission(request, env);

    return worker.fetch(request, env);
  },
} satisfies ExportedHandler<LegacyAdmissionEnv>;
