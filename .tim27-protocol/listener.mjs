import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

await mkdir('.tim27-protocol/runs', { recursive: true });

const directory = await mkdtemp(resolve('.tim27-protocol/runs/listener-'));

console.log(`Evidence: ${directory}`);

const requests = [];

const startedAt = Date.now();

let received;

const observed = new Promise((done) => {
  received = done;
});

const server = createServer((request, response) => {
  const record = {
    elapsedMs: Date.now() - startedAt,
    method: request.method,
    path: request.url,
    protocols: request.headers['x-agent-game-protocols'] ?? null,
    headerNames: Object.keys(request.headers),
    host: request.headers.host,
    userAgent: request.headers['user-agent'],
    connection: request.headers.connection,
    acceptEncoding: request.headers['accept-encoding'],
    authorization: request.headers.authorization ? '<REDACTED>' : null,
    peer: { address: request.socket.remoteAddress, port: request.socket.remotePort },
  };

  requests.push(record);
  void (async () => {
    if (process.argv.includes('--peer')) {
      record.socketOwners = await promisify(execFile)('ss', [
        '-tnp',
        `sport = :${address.port} or dport = :${address.port}`,
      ]).then(
        (result) => result.stdout,
        (error) => error.message,
      );
    }

    if (process.argv.includes('--scoped') && !record.path.startsWith('/api/')) response.statusCode = 404;
    record.responseStatus = response.statusCode;
    response.end('Loopback diagnostic listener');

    if (record.protocols === null) received(record);
  })();
});

await new Promise((done) => server.listen(0, '127.0.0.1', done));

const address = server.address();

let timer;

let packet;

try {
  packet = await Promise.race([
    observed,
    new Promise((done) => {
      timer = setTimeout(() => done(null), 5000);
    }),
  ]);
} finally {
  clearTimeout(timer);
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await writeFile(
    `${directory}/result.json`,
    JSON.stringify(
      {
        startedAt,
        address,
        requests,
        generatedHttpRequests: 0,
        cliInvocations: 0,
        matchedOriginalBlanketAssertion: !!packet,
        scopedFixture: process.argv.includes('--scoped'),
        verdict: !packet
          ? 'not-observed'
          : process.argv.includes('--scoped') && !packet.path.startsWith('/api/')
            ? 'non-api-request-handled'
            : 'blanket-assertion-rejects',
        originAttribution: process.argv.includes('--peer')
          ? 'See exact ss socket-owner capture'
          : 'User-Agent only; peer process not established',
      },
      null,
      2,
    ) + '\n',
  );
}

if (!packet) {
  console.log('No unsolicited headerless request within the bounded window.');
  process.exitCode = 2;
} else {
  console.log(JSON.stringify(packet, null, 2));

  if (!process.argv.includes('--scoped') || packet.path.startsWith('/api/')) {
    try {
      assert.equal(packet.protocols ?? undefined, '1,2');
    } catch (error) {
      await writeFile(`${directory}/assertion-stack.txt`, error.stack + '\n');
      throw error;
    }
  }
}
