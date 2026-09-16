import { readFile } from 'node:fs/promises';
import { Schema } from 'effect';
import { expect, it } from 'vitest';
import { solveRouting, routingChallenge } from '../src/game/coding-finale/routing';
import type { RoutingInput } from '../src/game/coding-finale/routing';
import type { Program, SubmissionRequest, Tier } from '../src/game/coding-finale/types';

type RequestBody =
  SubmissionRequest | { program: Program; inputs: RoutingInput[] } | { text: string } | Record<string, never>;

const ConnectionSchema = Schema.Struct({ origin: Schema.String, token: Schema.String });

const CreatedSchema = Schema.Struct({
  current: Schema.Struct({ id: Schema.String, challengeId: Schema.String }),
  credentials: Schema.Array(Schema.Struct({ seat: Schema.Int, token: Schema.String })),
});

const CurrentSchema = Schema.Struct({
  status: Schema.String,
  you: Schema.NullOr(Schema.Struct({ unlockedTier: Schema.Int })),
  submissions: Schema.Array(
    Schema.Struct({ sequence: Schema.Int, verdict: Schema.NullOr(Schema.String), status: Schema.String }),
  ),
  result: Schema.NullOr(Schema.Struct({ winnerSeat: Schema.Int, reason: Schema.String })),
});

it.skipIf(process.env.FINALE_INTEGRATION !== '1')(
  'plays the gated finale through real HTTP, Durable Objects, and Cloudflare Sandbox containers',
  async () => {
    const operator = Schema.decodeUnknownSync(ConnectionSchema)(
      JSON.parse(await readFile('.agent-game/finale-lab/operator.json', 'utf8')),
    );

    const call = (path: string, token: string | null, body?: RequestBody) => {
      const headers = new Headers({ 'content-type': 'application/json' });

      if (token) headers.set('authorization', `Bearer ${token}`);

      return fetch(`${operator.origin}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
    };

    const createdResponse = await call('/lab/finales', operator.token, {});
    expect(createdResponse.status).toBe(200);
    const created = Schema.decodeUnknownSync(CreatedSchema)(await createdResponse.json());
    const base = `/finales/${created.current.id}`;
    const first = created.credentials[0];
    const second = created.credentials[1];
    expect(second).toBeDefined();

    const current = async (token: string | null = first.token) => {
      const response = await call(`${base}/${token ? 'me' : 'current'}`, token);
      expect(response.status).toBe(200);

      return Schema.decodeUnknownSync(CurrentSchema)(await response.json());
    };

    await expect
      .poll(async () => (await current()).status, { timeout: 120_000, interval: 500 })
      .not.toBe('preparing');
    expect((await current()).status).toBe('racing');
    expect((await call(`${base}/me`, 'invalid')).status).toBe(401);
    expect((await call(`${base}/challenge?tier=2`, first.token)).status).toBe(409);
    expect((await call(`${base}/challenge?tier=2`, null)).status).toBe(401);

    const source = `export const solve = (${solveRouting.toString()});`;

    const send = async (
      token: string,
      tier: Tier,
      programSource: string,
      id: string,
      language: Program['language'] = 'javascript',
    ) => {
      const response = await call(`${base}/submit`, token, {
        actionId: id,
        challengeId: created.current.challengeId,
        tier,
        program: { language, source: programSource },
      });

      return response;
    };

    expect((await send(first.token, 2, source, 'skip-tier')).status).toBe(409);
    expect((await current()).submissions).toHaveLength(0);

    const practice = await call(`${base}/practice`, first.token, {
      program: { language: 'typescript', source: `${source}\nconst typed: number = 1;` },
      inputs: [routingChallenge(1).example.input],
    });

    expect(practice.status).toBe(200);

    const output = Schema.decodeUnknownSync(Schema.Struct({ stdout: Schema.String, exitCode: Schema.Int }))(
      await practice.json(),
    );

    expect(output.exitCode).toBe(0);
    expect(JSON.parse(output.stdout)).toEqual([7]);

    // Exercise the real container and Node permission boundary, including the
    // local egress proxy: the startup fix must preserve execution isolation.
    const isolationPrograms = [
      `import { readFileSync } from 'node:fs';
       export function solve() { try { readFileSync('/etc/passwd'); return 1; }
         catch (error) { return error.code === 'ERR_ACCESS_DENIED' ? -1 : 2; } }`,
      `import { writeFileSync } from 'node:fs';
       export function solve() { try { writeFileSync('escape.txt', 'test'); return 1; }
         catch (error) { return error.code === 'ERR_ACCESS_DENIED' ? -1 : 2; } }`,
      `import { execFileSync } from 'node:child_process';
       export function solve() { try { execFileSync('/bin/true'); return 1; }
         catch (error) { return error.code === 'ERR_ACCESS_DENIED' ? -1 : 2; } }`,
      `export async function solve() {
         try { await fetch('https://example.com', { signal: AbortSignal.timeout(500) }); return 1; }
         catch { return -1; } }`,
    ];

    for (const isolationSource of isolationPrograms) {
      const response = await call(`${base}/practice`, first.token, {
        program: { language: 'javascript', source: isolationSource },
        inputs: [routingChallenge(1).example.input],
      });

      expect(response.status).toBe(200);

      const isolated = Schema.decodeUnknownSync(
        Schema.Struct({ stdout: Schema.String, exitCode: Schema.Int }),
      )(await response.json());

      expect(isolated.exitCode).toBe(0);
      expect(JSON.parse(isolated.stdout)).toEqual([-1]);
    }

    // Hidden inputs printed by contestant errors never become feedback to the agent.
    expect(
      (
        await send(
          first.token,
          1,
          'export function solve(input) { throw new Error(JSON.stringify(input)); }',
          'crash',
        )
      ).status,
    ).toBe(200);
    await expect
      .poll(async () => (await current()).submissions[0]?.verdict, { timeout: 30_000 })
      .toBe('runtime-error');
    const privateBody = await (await call(`${base}/me`, first.token)).text();
    expect(privateBody).not.toContain('rechargers');
    expect(privateBody).not.toContain('edges');
    expect((await call(`${base}/source?sequence=1`, null)).status).toBe(409);

    expect(
      (await send(first.token, 1, 'export function solve() { while (true) {} }', 'timeout')).status,
    ).toBe(200);
    await expect
      .poll(async () => (await current()).submissions[1]?.verdict, { timeout: 30_000 })
      .toBe('time-limit');

    expect((await send(first.token, 1, source, 'tier-one', 'typescript')).status).toBe(200);
    await expect.poll(async () => (await current()).you?.unlockedTier, { timeout: 30_000 }).toBe(2);
    expect((await call(`${base}/challenge?tier=2`, first.token)).status).toBe(200);
    expect((await call(`${base}/challenge?tier=2`, second.token)).status).toBe(409);
    expect((await send(first.token, 1, source, 'tier-one', 'typescript')).status).toBe(200);
    expect((await current()).submissions).toHaveLength(3);
    expect(
      (await send(first.token, 1, 'export const solve = () => 123;', 'tier-one', 'typescript')).status,
    ).toBe(409);
    expect(
      (await call(`${base}/say`, first.token, { text: 'Tier 1 complete. Working on the extension.' })).status,
    ).toBe(200);
    expect(await (await call(`${base}/history?after=0`, null)).text()).toContain('Tier 1 complete');
    expect((await call(`${base}/say`, null, { text: 'Spectator interference' })).status).toBe(401);

    expect((await send(second.token, 1, source, 'other-tier-one')).status).toBe(200);
    await expect
      .poll(async () => (await current(second.token)).you?.unlockedTier, { timeout: 30_000 })
      .toBe(2);
    expect((await send(first.token, 2, source, 'tier-two')).status).toBe(200);
    await expect.poll(async () => (await current()).status, { timeout: 30_000 }).toBe('finished');
    expect((await current()).result).toEqual({ winnerSeat: first.seat, reason: 'tier-two' });
    expect((await current(null)).you).toBeNull();
    expect((await call(`${base}/source?sequence=3`, null)).status).toBe(200);
  },
  240_000,
);
