import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';

const server = new URL(process.argv[2] ?? 'https://agent-game.tk-d86.workers.dev').origin;

assert.equal(new URL(server).protocol, 'https:');

const run = promisify(execFile);

const checks = [];

async function check(path, status, body, headers = {}) {
  const response = await fetch(server + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { origin: server, 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  assert.equal(response.status, status, path);
  checks.push({ path, status, contentType: response.headers.get('content-type') });

  return response;
}

assert.deepEqual(await (await check('/api/health', 200)).json(), { ok: true, protocolVersion: '1' });

const bootstrap = await (await check('/api/bootstrap', 200)).json();

assert.equal(bootstrap.mode, 'ranked');

assert.equal(bootstrap.localLogin, false);

assert.equal(bootstrap.houseAvailable, true);

assert.deepEqual(bootstrap.authProviders.toSorted(), ['github', 'google']);

const houses = await (await check('/api/agents?house=true', 200)).json();

assert.equal(houses.length, 10);

for (const path of ['/api/owner', '/api/queue']) await check(path, 401);

for (const path of ['/api/dev/login', '/api/dev/exhibition']) {
  const error = await (await check(path, 404, { name: 'Production boundary check' })).json();
  assert.equal(error.error.code, 'not-found');
}

for (const path of ['/agents.md', '/protocol.md', '/rules.md', '/rating-method.md']) await check(path, 200);

const onboarding = await check('/agents.md', 200);

assert.equal(onboarding.headers.get('content-type'), 'text/markdown; charset=utf-8');

const instructions = await onboarding.text();

assert.ok(instructions.includes(`${server}/agents.md`));

assert.ok(!instructions.includes('{{') && !instructions.includes('<arena-host>'));

const providers = [];

for (const provider of ['github', 'google']) {
  const response = await check('/api/auth/sign-in/social', 200, {
    provider,
    callbackURL: server + '/dashboard',
    disableRedirect: true,
  });

  const url = new URL((await response.json()).url);
  assert.equal(url.hostname, provider === 'github' ? 'github.com' : 'accounts.google.com');
  assert.equal(url.searchParams.get('redirect_uri'), `${server}/api/auth/callback/${provider}`);
  assert.ok(url.searchParams.get('state'));
  assert.ok(response.headers.getSetCookie().some((cookie) => /; Secure\b/i.test(cookie)));
  providers.push({
    provider,
    authorizationHost: url.hostname,
    callback: url.searchParams.get('redirect_uri'),
    scope: url.searchParams.get('scope'),
    secureStateCookie: true,
    completedCallback: false,
  });
}

const directory = await mkdtemp('/tmp/opencode/agent-game-deployed-cli-');

let archive;

try {
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));

  const bytes = Buffer.from(
    await (await check(`/downloads/agent-game-cli-${version}.tgz`, 200)).arrayBuffer(),
  );

  archive = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  await writeFile(`${directory}/cli.tgz`, bytes);
  await run('tar', ['-xzf', `${directory}/cli.tgz`, '-C', directory]);
  const pkg = JSON.parse(await readFile(`${directory}/package/package.json`, 'utf8'));
  assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
  const entry = `${directory}/package/${pkg.bin['agent-game']}`;
  const bin = `${directory}/agent-game`;
  await symlink(entry, bin);
  assert.ok((await run(bin, ['help'])).stdout.includes('Setup:'));
  const config = `${directory}/connection.json`;

  const setup = JSON.parse(
    (
      await run(
        process.execPath,
        [
          entry,
          'setup',
          '--server',
          server,
          '--harness',
          'opencode',
          '--name',
          'Deployment verification (unapproved)',
          '--config',
          config,
        ],
        { env: { ...process.env, HOME: directory, XDG_CONFIG_HOME: `${directory}/config` } },
      )
    ).stdout,
  );

  assert.ok((await readFile(setup.skillPath, 'utf8')).includes('connections --harness opencode'));
  const paired = await run(bin, ['start', '--config', config]);
  const pairing = JSON.parse(paired.stdout);
  assert.equal(new URL(pairing.verificationUrl).origin, server);
  assert.match(pairing.code, /^[A-Z0-9]{10}$/);
  const pending = await run(process.execPath, [entry, 'pair-status', '--config', config]);
  assert.equal(JSON.parse(pending.stdout).status, 'pending');
  const { token } = JSON.parse(await readFile(config, 'utf8'));
  await check('/api/queue', 401, undefined, { authorization: `Bearer ${token}` });
  archive.pendingPairingVerified = true;
  archive.approvedPairingVerified = false;
  archive.setupSkillVerified = true;
  archive.symlinkExecutableVerified = true;
} finally {
  await rm(directory, { recursive: true, force: true });
}

const browser = await chromium.launch({ headless: true });

const browserChecks = [];

try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(server, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Your agent. Their next great rival.' })).toBeVisible();
    assert.equal(await page.getByRole('button', { name: 'Start local exhibition' }).count(), 0);
    const fitsViewport = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert.ok(fitsViewport, `Home overflow at ${width}px`);
    await page.screenshot({ path: `/tmp/opencode/agent-game-deployed-${width}.png`, fullPage: true });
    await page.getByRole('link', { name: 'Enter the arena', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Your next game starts with a conversation.' }),
    ).toBeVisible();
    await expect(page.getByLabel('Message for your agent')).toHaveValue(new RegExp(`${server}/agents\\.md`));
    await expect(page.getByRole('button', { name: 'Copy prompt' })).toBeVisible();

    const onboardingFitsViewport = await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    );

    assert.ok(onboardingFitsViewport, `Onboarding overflow at ${width}px`);
    await page.screenshot({
      path: `/tmp/opencode/agent-game-onboarding-deployed-${width}.png`,
      fullPage: true,
    });
    await page.goto(server + '/dashboard', { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    assert.equal(await page.getByLabel('Local preview identity').count(), 0);
    assert.deepEqual(errors, []);
    browserChecks.push({
      width,
      fitsViewport,
      onboardingFitsViewport,
      agentPromptVisible: true,
      signInProvidersVisible: true,
      pageErrors: errors,
    });
    await page.close();
  }
} finally {
  await browser.close();
}

const result = {
  at: new Date().toISOString(),
  server,
  checks,
  providers,
  archive,
  browserChecks,
  scope:
    'Public HTTP, browser rendering, OAuth initiation and unapproved CLI pairing. No match or inference started.',
};

const output = process.env.SMOKE_OUTPUT ?? 'docs/evaluation/deployment-smoke.json';

await mkdir(dirname(output), { recursive: true });

await writeFile(output, JSON.stringify(result, null, 2) + '\n');

console.log(JSON.stringify(result, null, 2));
