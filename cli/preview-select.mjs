import { readFile, mkdir } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { connectionIdentity } from './current.mjs';
import { lockLedger } from './ledger.mjs';
import { writeJsonDurably } from './durable-json.mjs';
import {
  activeArtifacts,
  cacheArtifacts,
  origin,
  previewError,
  previewRequest,
  sha256,
  text,
  validateManifest,
  verifyPins,
} from './preview-artifacts.mjs';
import { registerConnection, installationCommands } from './setup.mjs';
import { updateCurrent } from './agent-game.mjs';

const identifier = (value) => text(value, /^[\w-]{1,100}$/);

const proof = (value) => text(value, /^[\w-]{43}$/);

function arenas(value) {
  if (!Array.isArray(value) || value.length > 100)
    throw previewError('preview-registry', 'Invalid source arena registry.');

  return value.map((item) => {
    origin(item.origin);

    if (
      item.identityVersion !== 1 ||
      !text(item.incarnation, /^[\w-]{8,100}$/) ||
      !text(item.commit, /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/) ||
      item.ownerEntryUrl !== `${item.origin}/preview` ||
      ![true, false].includes(item.livePlay)
    )
      throw previewError('preview-registry', 'Invalid source arena registration.');

    return {
      origin: item.origin,
      incarnation: item.incarnation,
      commit: item.commit,
      identityVersion: 1,
      livePlay: item.livePlay,
    };
  });
}

async function read(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function sourceInstallation(flags) {
  if (!flags.config)
    throw previewError(
      'preview-source',
      'Select a saved source connection with --config. Use connections to discover it.',
    );
  const path = resolve(flags.config);
  const source = await read(path);

  if (!source || source.preview || !identifier(source.agentId) || !text(source.token, /^agk_[\w-]{43}$/))
    throw previewError(
      'preview-source',
      'Use an approved production/source installation, not a target connection.',
    );
  origin(source.server);
  const harness = flags.harness ?? source.harness;

  if (!['opencode', 'claude'].includes(harness) || (source.harness && harness !== source.harness))
    throw previewError('preview-harness', 'Use the source installation’s harness (opencode or claude).');

  return { path, source, harness };
}

export async function previewSelect(flags, list = false) {
  const { path: sourcePath, source, harness } = await sourceInstallation(flags);
  const available = arenas(await previewRequest(source.server, '/api/preview/arenas'));

  if (list)
    return {
      sourceOrigin: source.server,
      agentId: source.agentId,
      arenas: available,
      next: 'Use preview-select --server <registered origin> with this source --config. A preview uses independent authority and participation.',
    };
  const requestedOrigin = new URL(flags.server).origin;
  const target = available.find((item) => item.origin === requestedOrigin);

  if (!target || target.origin === source.server)
    throw previewError('preview-target', 'Target is not an active arena in this source registry.');
  const gameId = flags.game ?? source.selectedGame ?? 'secret-overlord';

  if (!['secret-overlord', 'succession'].includes(gameId))
    throw previewError('preview-game', 'Choose a supported game.');
  await previewRequest(source.server, '/api/queue', source.token);

  if (
    !identifier(source.connectionId) ||
    !Number.isSafeInteger(source.expiresAt) ||
    source.expiresAt <= Date.now()
  )
    throw previewError('preview-source', 'Source installation authority changed; reauthorize it explicitly.');

  const base = resolve(
    homedir(),
    '.agent-game/connections',
    `${harness}-preview-${sha256(JSON.stringify([source.server, target.origin, source.agentId, target.incarnation])).slice(0, 24)}`,
  );

  if (flags.renew && !text(flags.renew, /^[\w-]{8,100}$/))
    throw previewError(
      'preview-renew',
      'Use a new stable 8–100 character authorization label with --renew; reuse that label on retries.',
    );
  const configPath = `${base}${flags.renew ? `-${flags.renew}` : ''}/connection.json`;
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  const unlock = await lockLedger(`${base}.selection`);

  try {
    let state = await read(configPath);

    if (
      state &&
      (state.server !== target.origin ||
        state.agentId !== source.agentId ||
        state.harness !== harness ||
        state.preview?.incarnation !== target.incarnation ||
        state.preview.sourceIdentity !== connectionIdentity(source))
    )
      throw previewError(
        'preview-connection',
        'The saved target authorization belongs to another source connection. Use explicit --renew after source reauthorization.',
      );

    if (!state || state.preview.status === 'connected') {
      const query = new URLSearchParams({ origin: target.origin, commit: target.commit });

      const manifest = validateManifest(
        await previewRequest(source.server, `/api/preview/artifacts?${query}`),
        source.server,
        target,
      );

      const artifacts = await cacheArtifacts(manifest, gameId);

      if (!state) {
        const verifier = randomBytes(32).toString('base64url');
        const targetToken = `agk_${randomBytes(32).toString('base64url')}`;
        const requestId = randomUUID();

        const intent = {
          requestId,
          targetOrigin: target.origin,
          incarnation: target.incarnation,
          commit: target.commit,
          challenge: createHash('sha256').update(verifier).digest('base64url'),
          tokenHash: sha256(targetToken),
        };

        state = {
          server: target.origin,
          token: targetToken,
          agentId: source.agentId,
          agentName: source.agentName,
          harness,
          selectedGame: gameId,
          installation: `${harness} preview installation`,
          eventAuthorization: 'public-wakeup',
          pictureSource: { server: source.server, agentId: source.agentId },
          preview: {
            version: 1,
            sourceOrigin: source.server,
            sourceAgentId: source.agentId,
            sourceIdentity: connectionIdentity(source),
            sourceConnectionId: source.connectionId,
            incarnation: target.incarnation,
            commit: target.commit,
            artifacts,
            livePlay: target.livePlay,
            status: 'pending',
            createdAt: Date.now(),
            installationIntent: {
              sourceConfigPath: sourcePath,
              sourceConnectionId: source.connectionId,
              intent,
              verifier,
              targetToken,
              artifacts,
            },
          },
        };
      } else {
        await updateCurrent(configPath, (latest) => {
          if (connectionIdentity(latest) !== connectionIdentity(state))
            throw previewError('preview-connection', 'Target authority changed during selection.');
          latest.preview.artifacts = artifacts;
          latest.preview.commit = target.commit;
          latest.preview.livePlay = target.livePlay;
          latest.selectedGame = gameId;
          state = structuredClone(latest);
        });
      }

      // The full proof, target credential, source grant identity and immutable pins precede handoff I/O.
      if (state.preview.status === 'pending') await writeJsonDurably(configPath, state);
    }

    const saved = state.preview.installationIntent;

    if (state.preview.status !== 'connected') {
      if (
        saved.sourceConfigPath !== sourcePath ||
        saved.sourceConnectionId !== source.connectionId ||
        saved.intent.targetOrigin !== target.origin ||
        saved.intent.incarnation !== target.incarnation ||
        saved.targetToken !== state.token ||
        !proof(saved.verifier) ||
        sha256(state.token) !== saved.intent.tokenHash ||
        createHash('sha256').update(saved.verifier).digest('base64url') !== saved.intent.challenge
      )
        throw previewError(
          'preview-proof',
          'Saved handoff proof does not match this source/target installation.',
        );
      await verifyPins(saved.artifacts);

      if (!state.preview.code) {
        const response = await previewRequest(
          source.server,
          '/api/preview/agent-handoffs',
          source.token,
          saved.intent,
        );

        if (response.requestId !== saved.intent.requestId || !proof(response.code))
          throw previewError('preview-response', 'Invalid source handoff receipt.');
        state.preview.code = response.code;
        await writeJsonDurably(configPath, state);
      }

      const result = await previewRequest(target.origin, '/api/preview/agent-exchange', state.token, {
        requestId: saved.intent.requestId,
        code: state.preview.code,
        verifier: saved.verifier,
      });

      if (
        result.agentId !== source.agentId ||
        !identifier(result.connectionId) ||
        !Number.isSafeInteger(result.expiresAt) ||
        result.expiresAt <= Date.now()
      )
        throw previewError('preview-response', 'Invalid target exchange receipt.');
      state.connectionId = result.connectionId;
      state.expiresAt = result.expiresAt;
      state.preview.status = 'connected';
      await writeJsonDurably(configPath, state);
    }

    await verifyPins(activeArtifacts(state));
    // Every privileged target read revalidates derived source authority on the target server.
    const queue = await previewRequest(target.origin, '/api/queue', state.token);
    await registerConnection(harness, configPath, target.origin, activeArtifacts(state).executablePath);

    return {
      status: 'selected',
      configPath,
      sourceOrigin: source.server,
      server: target.origin,
      agentId: state.agentId,
      incarnation: target.incarnation,
      commit: state.preview.commit,
      livePlay: target.livePlay,
      queue,
      artifacts: activeArtifacts(state),
      ...installationCommands(configPath, activeArtifacts(state).executablePath),
      next: 'Read the pinned rules/protocol. Run connectCommand for optional setup or immediate active-match recovery, then startCommand. Live allocation may return preview-allocation-pending; no match has completed merely because selection succeeded.',
    };
  } finally {
    await unlock();
  }
}
