import { createServer } from 'node:http';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { waitForDeployment } from '../scripts/deployment-ready.mjs';

let requests: string[] = [];

let failuresRemaining = 0;

let statuses: number[] = [];

let origin = '';

const server = createServer((request, response) => {
  requests.push(`${request.method} ${request.url}`);

  const status = statuses.shift() ?? (failuresRemaining-- > 0 ? 404 : 200);

  if (status !== 200) {
    response.writeHead(404, { 'content-type': 'text/html' });
    response.end('Page not found');

    return;
  }

  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ ok: true, protocolVersion: '1' }));
});

beforeEach(() => {
  failuresRemaining = 0;
  statuses = [];
  requests = [];
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  if (!(address instanceof Object)) throw new Error('Missing server address');
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    }),
  );
});

it('waits for a newly deployed route to return valid health without making mutations', async () => {
  failuresRemaining = 2;
  await waitForDeployment(origin, { timeoutMs: 2000, intervalMs: 10, stableForMs: 0 });
  expect(requests).toEqual(['GET /api/health', 'GET /api/health', 'GET /api/health']);
});

it('requires sustained health when a new route alternates between available and unavailable', async () => {
  statuses = [404, 200, 404, 200];
  await waitForDeployment(origin, { timeoutMs: 2000, intervalMs: 5, stableForMs: 30 });
  expect(statuses).toEqual([]);
  expect(requests.length).toBeGreaterThanOrEqual(5);
  expect(requests.every((request) => request === 'GET /api/health')).toBe(true);
});

it('fails within its readiness budget when the route never becomes healthy', async () => {
  failuresRemaining = 1000;
  await expect(waitForDeployment(origin, { timeoutMs: 400, intervalMs: 10 })).rejects.toThrow(
    'Deployment was not ready within 400ms',
  );
  expect(requests.length).toBeGreaterThan(1);
});
