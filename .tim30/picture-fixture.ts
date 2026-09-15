import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AgentPicture } from '../src/shared/agent-picture';
import type { Observation } from '../src/game/types';
import type { Observation2 } from '../src/shared/succession';

// Same validated one-pixel PNG used by TIM-28. No image-generation service is involved.
export const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);

interface PictureAttempt {
  method: string;
  revision: string;
  id: string;
  type: string;
  bytes: Buffer;
  protocol?: string;
}

interface FixtureState {
  token: string;
  picture: AgentPicture;
  queue: { status: string };
  pictureFailure: number;
  writeFailure: number;
  dropBeforeWrite: boolean;
  wrongReceipt: boolean;
  malformed: string;
  etag: string;
  loseReceipt: boolean;
  writes: number;
  reads: number;
  joins: number;
  pairs: number;
  queueDuringRead: boolean;
  requests: PictureAttempt[];
  view: Observation | Observation2 | null;
}

// Local contract fixture, not a hosted arena or model invocation. TIM-28 owns real Worker/R2 coverage.
export async function pictureFixture(port = 6301) {
  const agentId = 'agent_tim30';
  const path = `/api/agents/${agentId}/picture`;
  const origin = `http://127.0.0.1:${port}`;

  const state: FixtureState = {
    token: '',
    picture: { state: 'missing', revision: 0 },
    queue: { status: 'idle' },
    pictureFailure: 0,
    writeFailure: 0,
    dropBeforeWrite: false,
    wrongReceipt: false,
    malformed: '',
    etag: '',
    loseReceipt: false,
    writes: 0,
    reads: 0,
    joins: 0,
    pairs: 0,
    queueDuringRead: false,
    requests: [],
    view: null,
  };

  const receipts = new Map<string, { fingerprint: string; picture: AgentPicture }>();

  function present(contentType: 'image/png' | 'image/jpeg' = 'image/png', bytes = 68): AgentPicture {
    const version = randomUUID();

    return {
      state: 'present',
      revision: state.picture.revision + 1,
      version,
      url: `${path}/${version}`,
      contentType,
      bytes,
      width: 1,
      height: 1,
    };
  }

  const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    const json = <T>(value: T) => response.end(JSON.stringify(value));

    const fault = (status: number) => {
      response.statusCode = status;
      json({ error: { code: 'fixture', status, message: `Untrusted reflected ${state.token}` } });
    };

    if (request.url === '/api/pairing') {
      state.pairs++;
      json({ verificationUrl: `${origin}/pair/fixture`, expiresAt: Date.now() + 60_000 });

      return;
    }

    if (request.url === '/api/pairing/status') {
      state.token = request.headers.authorization?.slice(7) ?? '';
      json({
        status: 'approved',
        agentId,
        agentName: 'Stable competitor',
        connectionId: randomUUID(),
        expiresAt: Date.now() + 60_000,
      });

      return;
    }

    if (request.headers.authorization !== `Bearer ${state.token}`) {
      fault(401);

      return;
    }

    if (request.url === '/api/queue') {
      if (request.method === 'POST') {
        state.joins++;
        state.queue = { status: 'queued' };
      }

      if (request.method === 'DELETE') state.queue = { status: 'idle' };
      json(state.queue);

      return;
    }

    if (request.url?.startsWith('/api/matches/') && state.view) {
      json(state.view);

      return;
    }

    if (request.url !== path) {
      fault(404);

      return;
    }

    if (state.pictureFailure) {
      fault(state.pictureFailure);

      return;
    }

    if (request.method === 'GET') {
      state.reads++;
      response.setHeader('ETag', state.etag || `"${state.picture.revision}"`);

      if (state.queueDuringRead) state.queue = { status: 'queued' };

      if (state.malformed) response.end(state.malformed);
      else json(state.picture);

      return;
    }

    const chunks: Buffer[] = [];

    for await (const chunk of request) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    const id = String(request.headers['idempotency-key']);
    const revision = String(request.headers['if-match']);
    const method = request.method ?? '';
    const type = String(request.headers['content-type'] ?? '');
    state.requests.push({
      method,
      revision,
      id,
      type,
      bytes,
      protocol: request.headers['x-agent-game-protocols']?.toString(),
    });

    const fingerprint = createHash('sha256')
      .update(JSON.stringify([method, revision, type]))
      .update(bytes)
      .digest('hex');

    const receipt = receipts.get(id);

    if (state.dropBeforeWrite) {
      state.dropBeforeWrite = false;
      response.destroy();

      return;
    }

    if (state.writeFailure) {
      fault(state.writeFailure);

      return;
    }

    if (receipt && receipt.fingerprint !== fingerprint) {
      fault(409);

      return;
    }

    if (!receipt && revision !== `"${state.picture.revision}"`) {
      fault(412);

      return;
    }

    if (!receipt) {
      state.writes++;
      state.picture =
        method === 'DELETE'
          ? { state: 'missing', revision: state.picture.revision + 1 }
          : present(type === 'image/jpeg' ? 'image/jpeg' : 'image/png', bytes.length);
      receipts.set(id, { fingerprint, picture: state.picture });
    }

    if (state.loseReceipt) {
      state.loseReceipt = false;
      response.destroy();

      return;
    }

    const result = receipts.get(id)!.picture;
    response.setHeader('ETag', `"${result.revision}"`);
    json(state.wrongReceipt ? { state: 'missing', revision: result.revision } : result);
  });

  await new Promise<void>((done, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', done);
  });

  return {
    state,
    origin,
    agentId,
    present,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((done, reject) => server.close((error) => (error ? reject(error) : done())));
    },
  };
}
