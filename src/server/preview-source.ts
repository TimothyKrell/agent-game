import { GameError } from '../game/types';
import {
  PreviewIntentSchema,
  PreviewRedeemSchema,
  PreviewReferenceSchema,
  PreviewIntrospectionSchema,
} from '../shared/preview';
import type { PreviewIntent, PreviewReceipt } from '../shared/preview';
import { agentSession, createAuth, ownerSession } from './auth';
import { hashSecret, json, randomSecret, readJson } from './http';
import { openPreview, previewEnabled, sealPreview } from './preview-config';
import {
  decodePreview,
  verifyPreviewRequest,
  previewBrowserOrigin,
  previewChallenge,
} from './preview-transport';

interface Handoff {
  id: string;
  arena: string;
  incarnation: string;
  commit_id: string;
  scope: 'owner' | 'agent';
  challenge: string;
  token_hash: string | null;
  owner_id: string | null;
  agent_id: string | null;
  session_id: string | null;
  grant_id: string | null;
  code_hash: string | null;
  encrypted_code: string | null;
  expires_at: number;
  authority_expires: number | null;
  redeemed_at: number | null;
  revoked_at: number | null;
}

async function handoff(env: Env, id: string): Promise<Handoff> {
  const row = await env.DB.prepare('SELECT * FROM preview_handoffs WHERE id=?').bind(id).first<Handoff>();

  if (!row) throw new GameError('preview-handoff', 'Handoff not found.', 401);

  return row;
}

async function active(env: Env, row: Handoff): Promise<void> {
  if (
    row.revoked_at !== null ||
    !row.owner_id ||
    !row.authority_expires ||
    row.authority_expires <= Date.now()
  )
    throw new GameError('preview-revoked', 'Source authority is no longer active.', 401);

  const arena = await env.DB.prepare(
    'SELECT origin FROM preview_arenas WHERE origin=? AND incarnation=? AND closed_at IS NULL',
  )
    .bind(row.arena, row.incarnation)
    .first();

  const authority =
    row.scope === 'owner'
      ? await env.DB.prepare(
          'SELECT s.id FROM session s JOIN owners o ON o.user_id=s.userId WHERE s.id=? AND o.id=? AND s.expiresAt>?',
        )
          .bind(row.session_id, row.owner_id, Date.now())
          .first()
      : await env.DB.prepare(
          `SELECT g.id FROM agent_grants g JOIN agents a ON a.id=g.agent_id WHERE g.id=?
      AND a.id=? AND a.owner_id=? AND a.retired_at IS NULL AND g.revoked_at IS NULL AND g.expires_at>?`,
        )
          .bind(row.grant_id, row.agent_id, row.owner_id, Date.now())
          .first();

  if (!arena || !authority)
    throw new GameError('preview-revoked', 'Source authority is no longer active.', 401);
}

async function start(env: Env, input: PreviewIntent, scope: 'owner' | 'agent'): Promise<Handoff> {
  const arena = await env.DB.prepare(
    `SELECT origin FROM preview_arenas WHERE origin=? AND incarnation=? AND commit_id=? AND closed_at IS NULL`,
  )
    .bind(input.targetOrigin, input.incarnation, input.commit)
    .first();

  if (!arena) throw new GameError('preview-target', 'Target revision is not registered.', 401);

  if ((scope === 'agent') !== !!input.tokenHash)
    throw new GameError('preview-scope', 'Invalid handoff scope.', 400);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO preview_handoffs
    (id,arena,incarnation,commit_id,scope,challenge,token_hash,expires_at) VALUES (?,?,?,?,?,?,?,?)`,
  )
    .bind(
      input.requestId,
      input.targetOrigin,
      input.incarnation,
      input.commit,
      scope,
      input.challenge,
      input.tokenHash ?? null,
      Date.now() + 600000,
    )
    .run();
  const row = await handoff(env, input.requestId);

  if (
    row.arena !== input.targetOrigin ||
    row.incarnation !== input.incarnation ||
    row.commit_id !== input.commit ||
    row.scope !== scope ||
    row.challenge !== input.challenge ||
    row.token_hash !== (input.tokenHash ?? null)
  )
    throw new GameError('preview-conflict', 'Handoff ID belongs to another request.', 409);

  return row;
}

async function issue(
  env: Env,
  row: Handoff,
  owner: string,
  session: string | null,
  grant: string | null,
  agent: string | null,
  expires: number,
) {
  const code = randomSecret();
  await env.DB.prepare(
    `UPDATE preview_handoffs SET owner_id=?,session_id=?,grant_id=?,agent_id=?,authority_expires=?,
    code_hash=?,encrypted_code=?,expires_at=? WHERE id=? AND owner_id IS NULL AND expires_at>?`,
  )
    .bind(
      owner,
      session,
      grant,
      agent,
      expires,
      await hashSecret(code),
      await sealPreview(env, code),
      Date.now() + 60000,
      row.id,
      Date.now(),
    )
    .run();
  const current = await handoff(env, row.id);

  if (
    current.owner_id !== owner ||
    current.session_id !== session ||
    current.grant_id !== grant ||
    current.agent_id !== agent ||
    !current.encrypted_code ||
    current.expires_at <= Date.now()
  )
    throw new GameError('preview-conflict', 'Handoff expired or belongs to another authority.', 409);
  await active(env, current);

  return { requestId: row.id, code: await openPreview(env, current.encrypted_code) };
}

async function receipt(env: Env, row: Handoff): Promise<PreviewReceipt> {
  const owner = await env.DB.prepare('SELECT id,name,handle FROM owners WHERE id=?')
    .bind(row.owner_id)
    .first<{ id: string; name: string; handle: string }>();

  if (!owner || !row.authority_expires)
    throw new GameError('preview-revoked', 'Owner is no longer available.', 401);

  return {
    version: 1,
    requestId: row.id,
    scope: row.scope,
    owner,
    agentId: row.agent_id,
    expiresAt: row.authority_expires,
  };
}

/** Registered target discovery and narrowly scoped source authority. No registration HTTP API. */
export async function sourcePreviewRoute(request: Request, env: Env): Promise<Response | null> {
  if (previewEnabled(env)) return null;
  const path = new URL(request.url).pathname;

  if (path === '/api/preview/arenas' && request.method === 'GET') {
    const arenas = (
      await env.DB.prepare(
        'SELECT origin,incarnation,commit_id AS "commit" FROM preview_arenas WHERE closed_at IS NULL ORDER BY origin LIMIT 100',
      ).all<{ origin: string; incarnation: string; commit: string }>()
    ).results;

    return json(
      arenas.map((arena) => ({
        ...arena,
        identityVersion: 1,
        ownerEntryUrl: `${arena.origin}/preview`,
        livePlay: false,
      })),
    );
  }

  if (request.method !== 'POST') return null;

  if (path === '/api/preview/agent-handoffs') {
    const principal = await agentSession(request, env);
    const input = await readJson(request, PreviewIntentSchema);

    return json(
      await issue(
        env,
        await start(env, input, 'agent'),
        principal.ownerId,
        null,
        principal.grantId,
        principal.agentId,
        principal.expiresAt,
      ),
    );
  }

  if (path === '/api/preview/owner-handoffs') {
    previewBrowserOrigin(request, env);
    const owner = (await ownerSession(request, env))!;
    const session = await createAuth(env).api.getSession({ headers: request.headers });
    const { requestId } = await readJson(request, PreviewReferenceSchema);
    const row = await handoff(env, requestId);

    if (!session || row.scope !== 'owner')
      throw new GameError('preview-scope', 'Owner handoff required.', 401);

    const arena = await env.DB.prepare(
      'SELECT origin FROM preview_arenas WHERE origin=? AND incarnation=? AND commit_id=? AND closed_at IS NULL',
    )
      .bind(row.arena, row.incarnation, row.commit_id)
      .first();

    if (!arena) throw new GameError('preview-target', 'Target revision changed.', 401);

    const result = await issue(
      env,
      row,
      owner.id,
      session.session.id,
      null,
      null,
      session.session.expiresAt.getTime(),
    );

    return json({ ...result, returnUrl: `${row.arena}/preview/return#${new URLSearchParams(result)}` });
  }

  if (
    ![
      '/api/preview/requests',
      '/api/preview/redeem',
      '/api/preview/introspect',
      '/api/preview/metadata',
    ].includes(path)
  )
    return null;
  const proof = await verifyPreviewRequest(env, request);

  if (path === '/api/preview/requests') {
    const input = decodePreview(PreviewIntentSchema, proof.payload);

    if (proof.origin !== input.targetOrigin || proof.incarnation !== input.incarnation)
      throw new GameError('preview-target', 'Wrong target identity.', 401);
    await start(env, input, 'owner');

    return json({ requestId: input.requestId });
  }

  const input =
    path === '/api/preview/redeem'
      ? decodePreview(PreviewRedeemSchema, proof.payload)
      : decodePreview(PreviewReferenceSchema, proof.payload);

  const row = await handoff(env, input.requestId);

  if (proof.origin !== row.arena || proof.incarnation !== row.incarnation)
    throw new GameError('preview-target', 'Wrong target identity.', 401);
  await active(env, row);

  if (path === '/api/preview/redeem') {
    const redeem = decodePreview(PreviewRedeemSchema, proof.payload);

    const current = await env.DB.prepare(
      'SELECT origin FROM preview_arenas WHERE origin=? AND incarnation=? AND commit_id=? AND closed_at IS NULL',
    )
      .bind(row.arena, row.incarnation, redeem.commit)
      .first();

    if (!current)
      throw new GameError('preview-target', 'Target deployed revision does not match the registry.', 401);

    const deadline =
      row.redeemed_at === null ? row.expires_at : Math.min(row.redeemed_at + 600000, row.authority_expires!);

    if (
      deadline <= Date.now() ||
      (await hashSecret(redeem.code)) !== row.code_hash ||
      (await previewChallenge(redeem.verifier)) !== row.challenge
    )
      throw new GameError('preview-proof', 'Invalid or expired exchange proof.', 401);

    if (row.redeemed_at === null) {
      await env.DB.prepare(
        `UPDATE preview_handoffs SET redeemed_at=? WHERE id=? AND redeemed_at IS NULL AND expires_at>?
        AND EXISTS(SELECT 1 FROM preview_arenas WHERE origin=arena AND incarnation=preview_handoffs.incarnation
        AND commit_id=preview_handoffs.commit_id AND closed_at IS NULL)`,
      )
        .bind(Date.now(), row.id, Date.now())
        .run();

      if ((await handoff(env, row.id)).redeemed_at === null)
        throw new GameError('preview-target', 'Target revision changed or handoff expired.', 401);
    }

    return json({ ...(await receipt(env, row)), tokenHash: row.token_hash });
  }

  if (row.redeemed_at === null) throw new GameError('preview-proof', 'Redeem the handoff first.', 401);

  if (path === '/api/preview/introspect') {
    const { agentId } = decodePreview(PreviewIntrospectionSchema, proof.payload);

    if (row.scope === 'agent' && agentId !== undefined && agentId !== row.agent_id)
      throw new GameError('preview-scope', 'Source authorization is for a different competitor.', 401);

    if (
      agentId !== undefined &&
      !(await env.DB.prepare('SELECT id FROM agents WHERE id=? AND owner_id=? AND retired_at IS NULL')
        .bind(agentId, row.owner_id)
        .first())
    )
      throw new GameError('preview-retired', 'Source competitor is retired or unavailable.', 401);

    return json({ active: true, expiresAt: row.authority_expires });
  }

  const { after = '' } = decodePreview(PreviewReferenceSchema, proof.payload);

  const agents = (
    await env.DB.prepare(
      `SELECT id,owner_id AS ownerId,name,description,retired_at AS retiredAt
    FROM agents WHERE owner_id=? AND (? IS NULL OR id=?) AND id>? ORDER BY id LIMIT 26`,
    )
      .bind(row.owner_id, row.agent_id, row.agent_id, after)
      .all<{ id: string; ownerId: string; name: string; description: string; retiredAt: number | null }>()
  ).results;

  return json({ version: 1, agents: agents.slice(0, 25), next: agents.length > 25 ? agents[24].id : null });
}
