import { expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Intentionally reproduces the historical unhandled async request-listener rejection.
// This diagnostic is excluded from the normal test configuration.
it('records a spontaneous non-CLI request at the original async blanket assertion', async () => {
  await mkdir('.tim27-protocol/runs', { recursive: true });
  const directory = await mkdtemp(resolve('.tim27-protocol/runs/blanket-'));
  console.log(`Evidence: ${directory}`);
  const requests = [];
  const scoped = process.env.PROTOCOL_SCOPED_FIXTURE === '1';
  let received;

  const observed = new Promise((done) => {
    received = done;
  });

  const server = createServer(async (request, response) => {
    const record = {
      method: request.method,
      path: request.url,
      protocols: request.headers['x-agent-game-protocols'] ?? null,
      userAgent: request.headers['user-agent'],
      headerNames: Object.keys(request.headers),
      peer: { address: request.socket.remoteAddress, port: request.socket.remotePort },
    };

    requests.push(record);
    received(record);

    if (scoped && !request.url.startsWith('/api/')) {
      response.statusCode = 404;
      response.end();

      return;
    }

    expect(request.headers['x-agent-game-protocols']).toBe('1,2');
    response.end();
  });

  let timer;
  await new Promise((done) => server.listen(0, '127.0.0.1', done));

  try {
    const packet = await Promise.race([
      observed,
      new Promise((done) => {
        timer = setTimeout(() => done(null), 5000);
      }),
    ]);

    expect(
      packet,
      'An ambient request must actually be observed; absence does not verify a fix',
    ).not.toBeNull();
    expect(packet.path).toBe('/');
    expect(packet.protocols).toBeNull();
  } finally {
    clearTimeout(timer);
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    await writeFile(
      `${directory}/result.json`,
      JSON.stringify({ scoped, generatedHttpRequests: 0, cliInvocations: 0, requests }, null, 2) + '\n',
    );
  }
});
