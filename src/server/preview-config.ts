import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto';
import { GameError } from '../game/types';
import { isLoopback } from './http';

/** Minimal control-plane database contract; native Worker D1 remains assignable. */
export interface PreviewStatement {
  bind(...values: (string | number | null)[]): PreviewStatement;
  first<T = unknown>(): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
}

export interface PreviewDatabase {
  prepare(sql: string): PreviewStatement;
  batch<T = unknown>(statements: PreviewStatement[]): Promise<D1Result<T>[]>;
}

export type PreviewEnvironment = Pick<
  Env,
  'ENVIRONMENT' | 'APP_URL' | 'PREVIEW_SOURCE_URL' | 'BETTER_AUTH_SECRET'
> & { DB: PreviewDatabase };

export type PreviewSourceEnvironment = Pick<
  PreviewEnvironment,
  'DB' | 'APP_URL' | 'ENVIRONMENT' | 'PREVIEW_SOURCE_URL'
>;

export interface PreviewTarget {
  sourceOrigin: string;
  origin: string;
  incarnation: string;
  commit: string;
  encryptedKey: string;
}

export interface PreviewRegistration {
  origin: string;
  incarnation: string;
  commit: string;
  publicKey: string;
}

export function previewEnabled(env: Pick<Env, 'PREVIEW_SOURCE_URL'>): boolean {
  return !!env.PREVIEW_SOURCE_URL;
}

export function previewOrigin(value: string, env: Pick<Env, 'ENVIRONMENT'>): string {
  const url = new URL(value);

  if (
    url.origin !== value ||
    (url.protocol !== 'https:' && !(env.ENVIRONMENT === 'development' && isLoopback(value)))
  )
    throw new GameError('preview-origin', 'Use an exact registered HTTPS origin.', 400);

  return value;
}

export function sealPreview(env: Pick<Env, 'BETTER_AUTH_SECRET'>, value: string): Promise<string> {
  return symmetricEncrypt({ key: previewSecret(env), data: value });
}

export function openPreview(env: Pick<Env, 'BETTER_AUTH_SECRET'>, value: string): Promise<string> {
  return symmetricDecrypt({ key: previewSecret(env), data: value });
}

function previewSecret(env: Pick<Env, 'BETTER_AUTH_SECRET'>): string {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)
    throw new GameError('preview-unconfigured', 'Preview authentication secret is not configured.', 503);

  return env.BETTER_AUTH_SECRET;
}

export async function previewTarget(env: PreviewEnvironment): Promise<PreviewTarget> {
  if (!previewEnabled(env)) throw new GameError('not-found', 'Preview bridge is not configured.', 404);

  const row = await env.DB.prepare(
    'SELECT incarnation,commit_id,encrypted_key FROM preview_runtime WHERE id=1',
  ).first<{ incarnation: string; commit_id: string; encrypted_key: string }>();

  if (!row) throw new GameError('preview-unconfigured', 'Preview registration is not ready.', 503);

  return {
    sourceOrigin: previewOrigin(env.PREVIEW_SOURCE_URL!, env),
    origin: previewOrigin(env.APP_URL, env),
    incarnation: row.incarnation,
    commit: row.commit_id,
    encryptedKey: row.encrypted_key,
  };
}

/** Trusted deployment-controller interface. Deliberately has no public HTTP route. */
export async function registerPreviewTarget(
  env: Pick<PreviewEnvironment, 'DB' | 'ENVIRONMENT'>,
  registration: PreviewRegistration,
): Promise<void> {
  previewOrigin(registration.origin, env);

  if (
    !/^[A-Za-z0-9_-]{8,100}$/.test(registration.incarnation) ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(registration.commit)
  )
    throw new Error('Invalid preview identity');
  await crypto.subtle.importKey(
    'spki',
    Uint8Array.from(atob(registration.publicKey), (c) => c.charCodeAt(0)),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  await env.DB.prepare(
    `INSERT INTO preview_arenas VALUES (?,?,?,?,NULL)
    ON CONFLICT(origin) DO UPDATE SET incarnation=excluded.incarnation,commit_id=excluded.commit_id,
    public_key=excluded.public_key,closed_at=NULL`,
  )
    .bind(registration.origin, registration.incarnation, registration.commit, registration.publicKey)
    .run();
}

/** Trusted controller writes target-local configuration using the independent auth secret. */
export async function configurePreviewTarget(
  env: PreviewEnvironment,
  incarnation: string,
  commit: string,
  privateKey: string,
): Promise<void> {
  previewOrigin(env.PREVIEW_SOURCE_URL!, env);
  previewOrigin(env.APP_URL, env);

  if (
    env.PREVIEW_SOURCE_URL === env.APP_URL ||
    !/^[A-Za-z0-9_-]{8,100}$/.test(incarnation) ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit)
  )
    throw new Error('Invalid preview identity');
  await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(privateKey), (c) => c.charCodeAt(0)),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  await env.DB.prepare(
    `INSERT INTO preview_runtime VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET
    incarnation=excluded.incarnation,commit_id=excluded.commit_id,encrypted_key=excluded.encrypted_key`,
  )
    .bind(incarnation, commit, await sealPreview(env, privateKey))
    .run();
}

/** Closing/replacing an incarnation permanently retires it; even trusted retries cannot reopen it. */
export async function closePreviewTarget(
  env: Pick<PreviewEnvironment, 'DB'>,
  origin: string,
  incarnation: string,
): Promise<void> {
  await env.DB.prepare(
    'UPDATE preview_arenas SET closed_at=? WHERE origin=? AND incarnation=? AND closed_at IS NULL',
  )
    .bind(Date.now(), origin, incarnation)
    .run();
}
