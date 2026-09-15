import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';

// Feasibility probe: real locked Better Auth handlers/cookies; SQLite exchange model.
// Source login is fixture email/password, NOT a real social callback or deployed bridge.
const sourceOrigin = 'https://source.example';

const targetOrigin = 'https://pr-27.example';

const hash = (value) => createHash('sha256').update(value).digest('hex');

const secret = () => randomBytes(32).toString('base64url');

const cookies = (response) =>
  response.headers
    .getSetCookie()
    .map((row) => row.split(';')[0])
    .join('; ');

const sourceStore = { user: [], session: [], account: [], verification: [] };

const targetStore = { user: [], session: [], account: [], verification: [] };

const source = betterAuth({
  baseURL: sourceOrigin,
  secret: secret(),
  database: memoryAdapter(sourceStore),
  emailAndPassword: { enabled: true },
  session: { cookieCache: { enabled: false } },
});

const signup = await source.api.signUpEmail({
  body: { name: 'Fixture Owner', email: 'owner@example.test', password: secret() },
  asResponse: true,
});

assert.equal(signup.status, 200);

const sourceCookie = cookies(signup);

const sourceSession = await source.api.getSession({ headers: new Headers({ cookie: sourceCookie }) });

assert.ok(sourceSession);

const ledger = new DatabaseSync(':memory:');

ledger.exec(`CREATE TABLE handoffs (
  hash TEXT PRIMARY KEY, audience TEXT NOT NULL, incarnation TEXT NOT NULL,
  verifier_hash TEXT NOT NULL, source_session TEXT NOT NULL, expires INTEGER NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0
)`);

const incarnation = 'fixture-incarnation-1';

const verifier = secret();

const issue = (expires = Date.now() + 60_000) => {
  const code = secret();
  ledger
    .prepare('INSERT INTO handoffs VALUES (?,?,?,?,?,?,0)')
    .run(hash(code), targetOrigin, incarnation, hash(verifier), sourceSession.session.id, expires);

  return code;
};

let redemptions = 0;

function consume(code, audience, generation, proof) {
  // The real bridge also authenticates the target's signed request. That is NOT modeled here.
  const active = sourceStore.session.some(
    (session) => session.id === sourceSession.session.id && session.expiresAt > new Date(),
  );

  if (!active) throw new APIError('UNAUTHORIZED', { message: 'Source authority revoked' });

  const result = ledger
    .prepare(
      `UPDATE handoffs SET consumed=1
    WHERE hash=? AND audience=? AND incarnation=? AND verifier_hash=? AND expires>?
      AND consumed=0 AND source_session=? RETURNING hash`,
    )
    .get(hash(code), audience, generation, hash(proof), Date.now(), sourceSession.session.id);

  if (!result) throw new APIError('UNAUTHORIZED', { message: 'Invalid handoff' });
  redemptions++;
}

let importedUser;

const target = betterAuth({
  baseURL: targetOrigin,
  secret: secret(),
  database: memoryAdapter(targetStore),
  trustedOrigins: [targetOrigin],
  session: { cookieCache: { enabled: false } },
  plugins: [
    {
      id: 'tim27-feasibility',
      endpoints: {
        unprotectedProbe: createAuthEndpoint('/preview/unprotected-probe', { method: 'POST' }, async (ctx) =>
          ctx.json({ reached: true }),
        ),
        completePreview: createAuthEndpoint('/preview/complete', { method: 'POST' }, async (ctx) => {
          if (ctx.headers?.get('origin') !== targetOrigin)
            throw new APIError('FORBIDDEN', { message: 'Use the target origin' });
          consume(ctx.body.code, targetOrigin, incarnation, verifier);
          const session = await ctx.context.internalAdapter.createSession(importedUser.id);
          await setSessionCookie(ctx, { session, user: importedUser });

          return ctx.json({ imported: true });
        }),
      },
    },
  ],
});

importedUser = await (
  await target.$context
).internalAdapter.createUser({
  name: 'Fixture Owner',
  email: 'source-owner@preview.agent-game.invalid',
  emailVerified: false,
});

const complete = (code, origin = targetOrigin) =>
  target.handler(
    new Request(`${targetOrigin}/api/auth/preview/complete`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    }),
  );

const code = issue();

const unprotected = await target.handler(
  new Request(`${targetOrigin}/api/auth/preview/unprotected-probe`, {
    method: 'POST',
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    body: '{}',
  }),
);

assert.equal(unprotected.status, 200);

assert.throws(() => consume(code, 'https://pr-28.example', incarnation, verifier));

assert.throws(() => consume(code, targetOrigin, 'recreated-stack', verifier));

assert.throws(() => consume(code, targetOrigin, incarnation, secret()));

assert.equal((await complete(code, 'https://evil.example')).status, 403);

const response = await complete(code);

assert.equal(response.status, 200);

assert.deepEqual(await response.json(), { imported: true });

const targetCookie = cookies(response);

const cookieHeader = response.headers.getSetCookie().join(';');

assert.match(cookieHeader, /HttpOnly/i);

assert.match(cookieHeader, /Secure/i);

assert.match(cookieHeader, /SameSite=Lax/i);

assert.doesNotMatch(cookieHeader, /Domain=/i);

const local = await target.api.getSession({ headers: new Headers({ cookie: targetCookie }) });

assert.equal(local.user.id, importedUser.id);

assert.notEqual(local.session.token, sourceSession.session.token);

assert.notEqual(local.session.id, sourceSession.session.id);

assert.equal(await target.api.getSession({ headers: new Headers({ cookie: sourceCookie }) }), null);

assert.equal(await source.api.getSession({ headers: new Headers({ cookie: targetCookie }) }), null);

assert.equal((await complete(code)).status, 401);

assert.equal((await complete(issue(Date.now() - 1))).status, 401);

const revokedCode = issue();

await (await source.$context).internalAdapter.deleteSession(sourceSession.session.token);

assert.equal((await complete(revokedCode)).status, 401);

assert.equal(redemptions, 1);

assert.equal(targetStore.account.length, 0);

assert.equal(targetStore.session.length, 1);

assert.equal(targetStore.user.length, 1);

// Local cookie remains cryptographically valid: the application MUST introspect
// its source-session reference for every privileged use, not only at redemption.
assert.ok(await target.api.getSession({ headers: new Headers({ cookie: targetCookie }) }));

ledger.close();

const packageInfo = JSON.parse(
  await readFile(new URL('../node_modules/better-auth/package.json', import.meta.url)),
);

assert.equal(packageInfo.version, '1.7.3');

await writeFile(
  new URL('./auth-result.json', import.meta.url),
  JSON.stringify(
    {
      betterAuth: packageInfo.version,
      runtime: process.version,
      checks: {
        actualPluginCreatesFreshLocalSession: true,
        localCookieSecureHttpOnlySameSiteLaxHostOnly: true,
        sourceAndTargetCookiesMutuallyRejected: true,
        bareCookielessPluginPostAcceptsForeignOrigin: true,
        crossOriginPostRejected: true,
        modeledWrongAudienceIncarnationVerifierRejected: true,
        modeledReplayExpiredAndRevokedSourceRejected: true,
        noProviderAccountOrSourceTokenCopied: true,
        localSessionAloneDoesNotHonorLaterSourceRevocation: true,
      },
      scope:
        'Better Auth memory adapter + SQLite model; no provider callback, D1 Worker, signed target HTTP, or live model.',
    },
    null,
    2,
  ) + '\n',
);

console.log(
  'PASS: locked Better Auth session seam; exchange negatives; source revocation requires application check.',
);
