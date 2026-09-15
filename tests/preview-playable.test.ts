import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Schema } from 'effect';
import { gameDescriptor } from '../src/game/descriptors';
import { decodeGameState, inspectGame } from '../src/game/registry';
import { assertArchive, assertLiveCheckpoint, assertSourceAccounting } from '../.tim27-playable/assertions';
import { hash } from '../.tim27-cli/artifacts';
import {
  initialize,
  shutdown,
  connection,
  cli,
  native,
  saved,
  source,
  target,
  query,
  matchQuery,
  post,
  pause,
  waitFor,
  captures,
  providerCalls,
  providerMode,
  accelerateQueued,
  targetIntent,
  restartTarget,
  events,
  publish,
  commit,
  incarnation,
} from '../.tim27-playable/harness';

beforeAll(initialize, 120000);

afterAll(shutdown, 30000);

for (const [harness, game] of [
  ['opencode', 'secret-overlord'],
  ['claude', 'succession'],
] as const) {
  it(`admits installed ${harness}/${game} through the real queue alarm and plays with source-metered house HTTP`, async () => {
    const f = await connection(harness, game);
    expect(f.selected.livePlay).toBe(true);
    expect(f.state.pictureSource).toEqual({ server: source, agentId: f.state.agentId });
    const joined = await cli(f.selected.configPath, ['start']);
    expect(joined.status).toBe('queued');
    const pending = await saved(f.selected.configPath);
    const callsBefore = providerCalls.length;
    const start = Date.now();
    let assigned = joined;
    // No fixture clock/alarm call here: actual scheduled production queue delivery.
    await waitFor(async () => {
      assigned = await cli(f.selected.configPath, ['status']);

      return assigned.status === 'matched';
    }, 45000);
    expect(Date.now() - start).toBeGreaterThan(27000);

    const rows = await query(
      target,
      'SELECT * FROM preview_target_allocations WHERE match_id=?',
      [assigned.matchId],
      true,
    );

    const receipt = JSON.parse(String(rows[0].receipt));
    expect(receipt.intent.tickets[0].queueRequestId).toBe(pending.pendingJoin.requestId);
    expect(receipt.snapshot.timing).toEqual(gameDescriptor(game).timing);
    expect(receipt.snapshot.houseModel).toMatchObject({ provider: 'openai', model: 'gpt-4.1-mini' });
    const initial = JSON.parse(String((await matchQuery(assigned.matchId, 'SELECT data FROM game'))[0].data));
    expect(initial.snapshot).toEqual(receipt.snapshot);
    expect(initial.snapshot.mode).toBe('preview');

    const liveBoundaries =
      game === 'succession' ? await assertLiveCheckpoint(assigned.matchId, f.state.token) : [];

    const child = await native(f.selected.configPath, harness, game);
    let finished = false;
    let steps = 0;
    let phase = '';
    let phaseSeen = Date.now();
    let view;
    const until = Date.now() + 300000;

    while (Date.now() < until) {
      view = await cli(f.selected.configPath, ['observe']);

      if (view.status !== 'active') {
        finished = true;
        break;
      }

      if (view.phase.id !== phase) {
        phase = view.phase.id;
        phaseSeen = Date.now();
      }

      // Explicit accepted test-only logical-window control, after real normal-profile admission.
      if (view.phase.kind.includes('discussion') && Date.now() - phaseSeen > 1200) {
        await post(target, '/fixture/clock', {
          matchId: assigned.matchId,
          phaseId: phase,
          kind: 'discussion',
        });
        steps++;
      }

      await pause(200);
    }

    expect(finished, JSON.stringify(view)).toBe(true);
    expect(view.status).toBe('finished');
    expect(view.you.forfeited).toBe(false);
    const result = await child.result;
    expect(result.error).toBeNull();
    expect(result.value.invocations).toBe(1);

    const journal = (await readFile(child.log, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    expect(journal.find((event) => event.type === 'loaded').rules).toContain('PLAYABLE_BRANCH_A');
    expect(hash(journal.find((event) => event.type === 'loaded').wrapper)).toBe(
      f.selected.artifacts.executableDigest,
    );
    const commands = journal.filter((event) => event.type === 'cli');

    for (let index = 0; index < commands.length - 1; index++) {
      if (commands[index].command[0] === 'observe' && commands[index].required)
        expect(['act', 'observe']).toContain(commands[index + 1].command[0]);
    }

    if (harness === 'opencode') {
      expect(
        journal.some(
          (event) => event.type === 'native-api' && event.args[0] === 'api' && event.args[1] === 'post',
        ),
      ).toBe(true);
      expect(
        journal.some(
          (event) => event.type === 'native-api' && event.args[0] === 'api' && event.args[1] === 'get',
        ),
      ).toBe(true);
    }

    expect(
      journal.some((event) => event.type === 'cli' && event.command[0] === 'act' && event.accepted),
    ).toBe(true);
    expect(
      journal.some((event) => event.type === 'cli' && event.command[0] === 'say' && event.accepted),
    ).toBe(true);
    expect(await readFile(f.config)).toEqual(f.sourceBytes);
    const branchRoot = f.selected.artifacts.rulesPath.split('/package/')[0];
    await expect(readFile(`${branchRoot}/package/cli/untrusted.mjs`)).rejects.toMatchObject({
      code: 'ENOENT',
    });

    const Traffic = Schema.Array(
      Schema.Struct({
        path: Schema.String,
        method: Schema.String,
        credentialHash: Schema.NullOr(Schema.String),
        cookie: Schema.Boolean,
      }),
    );

    const traffic = Schema.decodeUnknownSync(Traffic)(
      await (await post(target, '/fixture/traffic', {})).json(),
    );

    expect(traffic.some((row: { path: string }) => row.path.endsWith('/ticket'))).toBe(false);
    expect(
      traffic.some(
        (row: { credentialHash: string | null }) =>
          row.credentialHash === hash(`Bearer ${JSON.parse(f.sourceBytes.toString()).token}`),
      ),
    ).toBe(false);
    expect(traffic.every((row) => !row.cookie)).toBe(true);

    const sourceTraffic = Schema.decodeUnknownSync(Traffic)(
      await (await post(source, '/fixture/traffic', {})).json(),
    );

    expect(sourceTraffic.some((row) => row.path.startsWith('/api/owner') && row.cookie)).toBe(true);
    const matchTraffic = traffic.filter((row) => row.path.startsWith(`/api/matches/${assigned.matchId}`));
    const sockets = matchTraffic.filter((row) => row.path.includes('/events'));
    expect(sockets.length).toBeGreaterThan(0);
    expect(sockets.every((row) => row.credentialHash === null)).toBe(true);
    expect(
      matchTraffic
        .filter((row) => !row.path.includes('/events'))
        .every(
          (row) => row.credentialHash === null || row.credentialHash === hash(`Bearer ${f.state.token}`),
        ),
    ).toBe(true);
    const privateWrites = matchTraffic.filter((row) => row.method === 'POST');
    expect(privateWrites.length).toBeGreaterThan(0);
    expect(privateWrites.every((row) => row.credentialHash === hash(`Bearer ${f.state.token}`))).toBe(true);
    expect(providerCalls.length).toBeGreaterThan(0);
    expect(await query(target, 'SELECT * FROM usage', [], true)).toEqual([]);
    const usage = await assertSourceAccounting(receipt, callsBefore);
    await assertArchive(assigned.matchId, f.state.token, game, liveBoundaries);
    captures.push({
      harness,
      game,
      joined,
      assigned,
      receipt,
      result: result.value,
      logicalDiscussionWindows: steps,
      sourceUsage: usage,
      originalAgentForfeited: view.you.forfeited,
    });
    expect(joined.fillAt - joined.joinedAt).toBe(30000);
  }, 390000);
}

it('recovers lost source and Match acknowledgements with identical installed-client intent, then retains branch A and hot-revocation accounting', async () => {
  const f = await connection('opencode', 'succession');
  const beforeCalls = providerCalls.length;
  await query(source, "INSERT INTO playable_faults VALUES ('allocation-ack','1')", [], true);
  const queued = await cli(f.selected.configPath, ['start']);
  const pending = await saved(f.selected.configPath);
  const child = await native(f.selected.configPath, 'opencode', 'recovered-branch-A');
  await waitFor(async () => !!(await readFile(`${f.selected.configPath}.supervisor.json`).catch(() => null)));
  const queueLedger = await saved(`${f.selected.configPath}.supervisor.json`);
  expect(queueLedger.pendingJoin.requestId).toBe(pending.pendingJoin.requestId);
  await waitFor(async () => !!(await targetIntent(pending.pendingJoin.requestId)), 45000);
  const intent = await targetIntent(pending.pendingJoin.requestId);
  expect(intent.receipt).toBeNull();
  expect(intent.init_dispatched).toBe(0);

  const sourceRow = (
    await query(
      source,
      "SELECT * FROM preview_broker_allocations WHERE json_extract(receipt,'$.intent.targetMatchId')=?",
      [String(intent.match_id)],
      true,
    )
  )[0];

  const originalReceipt = JSON.parse(String(sourceRow.receipt));
  expect(originalReceipt.intent).toEqual(JSON.parse(String(intent.intent)));
  expect(providerCalls.length).toBe(beforeCalls);
  expect(await matchQuery(String(intent.match_id), 'SELECT count(*) AS n FROM game')).toEqual([{ n: 0 }]);
  await query(target, "INSERT INTO playable_controls VALUES ('initialize-ack','1')");
  await restartTarget();
  expect((await saved(f.selected.configPath)).pendingJoin).toEqual(pending.pendingJoin);
  await query(source, "DELETE FROM playable_faults WHERE key='allocation-ack'", [], true);
  await post(target, '/fixture/queue-alarm', {});
  const created = await targetIntent(pending.pendingJoin.requestId);
  expect(created.init_dispatched).toBe(1);
  expect(JSON.parse(String(created.receipt))).toEqual(originalReceipt);

  const initialization = JSON.parse(
    await (await post(target, '/fixture/initialization-receipt', { matchId: intent.match_id })).text(),
  );

  expect(initialization.initialized).toBe(true);

  const initialRecord = JSON.parse(
    String((await matchQuery(String(intent.match_id), 'SELECT data FROM game'))[0].data),
  );

  await restartTarget();
  await post(target, '/fixture/queue-alarm', {});
  const assignment = await cli(f.selected.configPath, ['start']);
  expect(assignment.matchId).toBe(intent.match_id);
  expect(
    (
      await query(
        source,
        'SELECT receipt FROM preview_broker_allocations WHERE id=?',
        [String(sourceRow.id)],
        true,
      )
    )[0].receipt,
  ).toBe(sourceRow.receipt);

  const recoveredRecord = JSON.parse(
    String((await matchQuery(String(intent.match_id), 'SELECT data FROM game'))[0].data),
  );

  expect(recoveredRecord.createdAt).toBe(initialRecord.createdAt);
  expect(recoveredRecord.seats.map((seat: { entrant: object }) => seat.entrant)).toEqual(
    initialRecord.seats.map((seat: { entrant: object }) => seat.entrant),
  );
  await query(target, "DELETE FROM playable_controls WHERE key='initialize-ack'");
  const pins = (await saved(f.selected.configPath)).previewParticipation.artifacts;
  const branchB = hash(`${commit}-rules-only`).slice(0, 40);
  await publish(branchB, 'PLAYABLE_BRANCH_B');

  const reselected = await cli(f.config, [
    'preview-select',
    '--server',
    target,
    '--game',
    'succession',
    '--renew',
    f.label,
  ]);

  expect(reselected.artifacts).toEqual(pins);
  expect((await saved(f.selected.configPath)).preview.artifacts.commit).toBe(branchB);
  await waitFor(async () => (await events(child.log)).some((event) => event.type === 'loaded'));
  expect((await events(child.log)).find((event) => event.type === 'loaded').rules).toContain(
    'PLAYABLE_BRANCH_A',
  );
  const ledgerBefore = await saved(`${f.selected.configPath}.supervisor.json`);
  const sourceState = await saved(f.config);
  await query(source, 'UPDATE agent_grants SET revoked_at=? WHERE id=?', [
    Date.now(),
    sourceState.connectionId,
  ]);
  const stopped = await child.result;
  expect(stopped.error).toBeNull();
  expect(stopped.value.reason).toBe('authority-ended');
  const ledgerAfter = await saved(`${f.selected.configPath}.supervisor.json`);
  expect(ledgerAfter.allowances).toEqual(ledgerBefore.allowances);
  expect(ledgerAfter.allowances).toEqual(queueLedger.allowances);
  expect(ledgerAfter.invocations).toBe(1);
  expect(ledgerAfter.artifacts).toEqual(pins);
  const ledgerBytes = await readFile(`${f.selected.configPath}.supervisor.json`);
  await expect(cli(f.selected.configPath, ['play', '--harness', 'opencode'])).rejects.toBeDefined();
  expect(await readFile(`${f.selected.configPath}.supervisor.json`)).toEqual(ledgerBytes);
  await post(target, '/fixture/complete', { matchId: intent.match_id });
  captures.push({
    recovery: 'source-ack + init-ack + target restarts',
    intent: originalReceipt.intent,
    initialization,
    sourceReceipt: originalReceipt,
    stopped: stopped.value,
    sameAllowances: true,
  });
  await waitFor(
    async () =>
      (await query(source, 'SELECT state FROM allocations WHERE id=?', [String(sourceRow.id)], true))[0]
        .state === 'settled',
  );
  await assertSourceAccounting(originalReceipt, beforeCalls);
  const newIncarnation = `${incarnation}-fresh`;
  await post(source, '/fixture/close', { origin: target, incarnation });
  await publish(branchB, 'PLAYABLE_BRANCH_B', newIncarnation);
  const fresh = await connection('claude', 'succession');
  expect(fresh.selected.configPath).not.toBe(f.selected.configPath);
  expect(fresh.state.preview.incarnation).toBe(newIncarnation);
  expect(await readFile(`${f.selected.configPath}.supervisor.json`)).toEqual(ledgerBytes);
  expect(await readFile(f.config)).toEqual(f.sourceBytes);
  expect(queued.fillAt - queued.joinedAt).toBe(30000);
}, 90000);

it('runs native Claude on a normal source-funded Secret Overlord seat and preserves unknown charges across timeout takeover and closure', async () => {
  const f = await connection('claude', 'secret-overlord');
  const joined = await cli(f.selected.configPath, ['start']);
  let assignment = joined;
  providerMode.missingUsage = true;
  providerMode.hold = true;
  await waitFor(async () => {
    assignment = await cli(f.selected.configPath, ['status']);

    return assignment.status === 'matched';
  }, 45000);

  const row = (
    await query(
      target,
      'SELECT * FROM preview_target_allocations WHERE match_id=?',
      [assignment.matchId],
      true,
    )
  )[0];

  const receipt = JSON.parse(String(row.receipt));
  const child = await native(f.selected.configPath, 'claude', 'claude-timeout', 'late-required');
  await waitFor(
    async () =>
      Number(
        (
          await query(
            source,
            'SELECT count(*) AS n FROM usage WHERE match_id=?',
            [receipt.allocationId],
            true,
          )
        )[0].n,
      ) > 0,
  );
  const production = JSON.parse(await (await post(source, '/fixture/production', {})).text());
  expect(production.ok).toBe(true);
  const status = JSON.parse(await (await post(target, '/fixture/source-status', {})).text());
  expect(status.secretOverlord.activeAllocations).toBe(2);
  expect(status.secretOverlord.activeReservedUsd).toBe(3);

  const waiter = {
    id: `playable-required-${randomUUID()}`,
    matchId: receipt.allocationId,
    estimate: 1.5,
    deadline: Date.now() + 20000,
    mandatory: true,
  };

  expect(JSON.parse(await (await post(source, '/fixture/reserve', waiter)).text())).toMatchObject({
    allowed: false,
    reason: 'match-budget',
    retryable: true,
  });

  const optional = {
    ...waiter,
    id: `playable-optional-${randomUUID()}`,
    matchId: production.value.matchId,
    estimate: 0.001,
    mandatory: false,
  };

  expect(JSON.parse(await (await post(source, '/fixture/reserve', optional)).text())).toMatchObject({
    allowed: false,
    reason: 'required-priority',
  });
  const required = { ...optional, id: `playable-production-required-${randomUUID()}`, mandatory: true };
  expect(JSON.parse(await (await post(source, '/fixture/reserve', required)).text())).toMatchObject({
    allowed: true,
  });
  await post(source, '/fixture/retire-waiter', { id: waiter.id, matchId: waiter.matchId });
  await post(source, '/fixture/retire-waiter', { id: optional.id, matchId: optional.matchId });
  await post(source, '/fixture/record-unknown', { id: required.id });
  await post(source, '/fixture/complete', { matchId: production.value.matchId });
  providerMode.hold = false;
  captures.push({
    sharedSlotsAndPriority: status,
    nativePreviewAllocation: receipt.allocationId,
    productionMatch: production.value.matchId,
    controlledReservations: {
      blockedPreviewRequired: waiter.id,
      blockedProductionOptional: optional.id,
      admittedProductionRequired: required.id,
    },
    controlledRequiredSettlement: 'unknown estimate retained; no provider dispatch attributed to control',
  });
  let view;
  await waitFor(async () => {
    view = await cli(f.selected.configPath, ['observe']);

    if (view.phase.kind.includes('discussion'))
      await post(target, '/fixture/clock', {
        matchId: assignment.matchId,
        phaseId: view.phase.id,
        kind: 'discussion',
      });

    return (await events(child.log)).some((event) => event.type === 'simulated-latency');
  }, 30000);
  view = await cli(f.selected.configPath, ['observe']);
  const originalSeat = view.you.seat;
  // Expire only the external controller's window, after actual house HTTP decisions settle.
  await waitFor(async () => {
    const state = decodeGameState({
      ...JSON.parse(String((await matchQuery(assignment.matchId, 'SELECT data FROM game'))[0].data)),
      events: (await matchQuery(assignment.matchId, 'SELECT data FROM events ORDER BY id')).map((row) =>
        JSON.parse(String(row.data)),
      ),
    });

    const runtime = inspectGame(state);
    expect(runtime.status).toBe('active');

    return runtime.pendingSeats.length === 1 && runtime.pendingSeats[0] === originalSeat;
  });
  providerMode.hold = true;
  await post(target, '/fixture/clock', {
    matchId: assignment.matchId,
    phaseId: view.phase.id,
    kind: 'grace',
  });
  await waitFor(async () => {
    view = await cli(f.selected.configPath, ['observe']);

    return view.you.forfeited;
  });
  expect(view.you.seat).toBe(originalSeat);
  expect(view.you.generation).toBeGreaterThan(0);
  expect(view.private).toBeNull();
  expect((await saved(f.selected.configPath)).pictureSource).toEqual(f.state.pictureSource);
  await waitFor(
    async () =>
      (
        await query(
          source,
          'SELECT count(*) AS n FROM usage WHERE match_id=? AND done=0',
          [receipt.allocationId],
          true,
        )
      )[0].n !== 0,
  );
  const before = await query(source, 'SELECT * FROM usage WHERE match_id=?', [receipt.allocationId], true);
  expect(before.some((usage) => usage.actual === null && Number(usage.reserved) > 0)).toBe(true);
  await post(target, '/fixture/complete', { matchId: assignment.matchId });
  await post(target, '/fixture/queue-alarm', {});
  await waitFor(
    async () =>
      (
        await query(
          source,
          'SELECT closed FROM preview_broker_allocations WHERE id=?',
          [receipt.allocationId],
          true,
        )
      )[0].closed === 1,
  );

  const held = (
    await query(source, 'SELECT state,reservation FROM allocations WHERE id=?', [receipt.allocationId], true)
  )[0];

  expect(held.state).not.toBe('settled');
  expect(held.reservation).toBe(1.5);
  providerMode.hold = false;
  await waitFor(
    async () =>
      (await query(source, 'SELECT state FROM allocations WHERE id=?', [receipt.allocationId], true))[0]
        .state === 'settled',
    15000,
  );
  const after = await query(source, 'SELECT * FROM usage WHERE match_id=?', [receipt.allocationId], true);

  for (const usage of before) {
    const retained = after.find((entry) => entry.id === usage.id);
    expect(retained).toBeDefined();
    expect(retained!.reserved).toBe(usage.reserved);
    expect(retained!.actual).toBeNull();
  }

  expect(await query(target, 'SELECT * FROM usage', [], true)).toEqual([]);
  const result = await child.result;
  expect(result.error).toBeNull();
  expect(result.value.invocations).toBe(1);
  captures.push({
    harness: 'claude',
    game: 'secret-overlord',
    simulatedNativeLatency: true,
    takeover: { seat: originalSeat, generation: view.you.generation },
    supervisor: result.value,
    unknownRowsBeforeClose: before,
    retainedRows: after,
  });
  providerMode.missingUsage = false;
  providerMode.delay = 0;
  expect(joined.fillAt - joined.joinedAt).toBe(30000);
}, 120000);

it('rechecks revoked grants and canceled exact tickets before first initialization through installed start/leave', async () => {
  for (const boundary of ['source-revoke', 'cancel-ticket']) {
    const f = await connection('claude', 'secret-overlord');
    const calls = providerCalls.length;
    await query(source, "INSERT INTO playable_faults VALUES ('allocation-ack','1')", [], true);
    const pending = await accelerateQueued(f.selected.configPath);
    const intent = await targetIntent(pending.pendingJoin.requestId);
    expect(intent.init_dispatched).toBe(0);

    if (boundary === 'source-revoke') {
      const original = await saved(f.config);
      await query(source, 'UPDATE agent_grants SET revoked_at=? WHERE id=?', [
        Date.now(),
        original.connectionId,
      ]);
    } else {
      expect(await cli(f.selected.configPath, ['leave'])).toMatchObject({ status: 'idle' });
    }

    await restartTarget();
    await query(source, "DELETE FROM playable_faults WHERE key='allocation-ack'", [], true);
    await post(target, '/fixture/queue-alarm', {});
    await waitFor(async () => (await targetIntent(pending.pendingJoin.requestId)).closed === 1);
    expect(await matchQuery(String(intent.match_id), 'SELECT count(*) AS n FROM game')).toEqual([{ n: 0 }]);
    expect(providerCalls.length).toBe(calls);
    captures.push({ boundary, canceledIntent: JSON.parse(String(intent.intent)), providerDispatches: 0 });
  }
}, 60000);
