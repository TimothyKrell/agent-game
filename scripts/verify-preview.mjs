import assert from 'node:assert/strict';

const server = new URL(process.argv[2]).origin;

assert.equal(new URL(server).protocol, 'https:');

async function request(path, status, body) {
  const response = await fetch(server + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { origin: server, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  const text = await response.text();

  assert.equal(response.status, status, `${path}: ${text.slice(0, 2048)}`);

  return JSON.parse(text);
}

assert.deepEqual(await request('/api/health', 200), { ok: true, protocolVersion: '1' });

const bootstrap = await request('/api/bootstrap', 200);

assert.equal(bootstrap.mode, 'preview');

assert.equal(bootstrap.localLogin, false);

assert.equal(bootstrap.houseAvailable, true);

assert.deepEqual(bootstrap.authProviders, []);

await request('/api/dev/login', 404, { name: 'Preview isolation probe' });

await request('/api/owner', 401);

const { matchId } = await request('/api/dev/exhibition', 200, {});

const deadline = Date.now() + 180_000;

let view;

do {
  view = await request(`/api/matches/${matchId}`, 200);
  assert.equal(view.mode, 'preview');
  assert.equal(view.you, null);
  assert.equal(view.private, null);

  if (view.status !== 'active') break;
  await new Promise((resolve) => setTimeout(resolve, 2000));
} while (Date.now() < deadline);

assert.equal(view.status, 'finished', 'Scripted preview must complete');

assert.equal(view.seats.length, 10);

assert.ok(view.seats.every((seat) => seat.role && !seat.forfeited));

assert.ok(view.reveal);

console.log(JSON.stringify({ server, matchId, status: view.status, mode: view.mode, winner: view.winner }));
