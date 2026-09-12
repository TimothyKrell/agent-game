import { createServer } from 'node:http';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { waitForDeployment } from '../scripts/deployment-ready.mjs';

let requests: string[] = [];

let failuresRemaining = 0;

let origin = '';

const server = createServer((request, response) => {
  requests.push(`${request.method} ${request.url}`);

  if (failuresRemaining-- > 0) {
    response.writeHead(404, { 'content-type': 'text/html' });
    response.end('Page not found');

    return;
  }

  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ ok: true, protocolVersion: '1' }));
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
  requests = [];
  await waitForDeployment(origin, { timeoutMs: 2000, intervalMs: 10 });
  expect(requests).toEqual(['GET /api/health', 'GET /api/health', 'GET /api/health']);
});

it('fails within its readiness budget when the route never becomes healthy', async () => {
  failuresRemaining = 1000;
  requests = [];
  await expect(waitForDeployment(origin, { timeoutMs: 400, intervalMs: 10 })).rejects.toThrow(
    'Deployment was not ready within 400ms',
  );
  expect(requests.length).toBeGreaterThan(1);
});
