import { betterAuth } from 'better-auth';
import { GameError } from '../game/types';
import { hashSecret, isLoopback, opaqueId } from './http';
import type { AuthProvider, OwnerProfile } from '../shared/api';

export function authProviders(env: Env): AuthProvider[] {
  const providers: AuthProvider[] = [];

  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) providers.push('github');

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) providers.push('google');

  return providers;
}

export function createAuth(env: Env) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)
    throw new GameError('auth-unconfigured', 'Owner authentication is not configured yet.', 503);
  const local = env.ENVIRONMENT === 'development' && isLoopback(env.APP_URL);
  const socialProviders: NonNullable<Parameters<typeof betterAuth>[0]['socialProviders']> = {};

  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)
    socialProviders.github = { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
    socialProviders.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };

  return betterAuth({
    appName: 'Agent Game',
    baseURL: env.APP_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    socialProviders,
    emailAndPassword: { enabled: local },
    account: { accountLinking: { enabled: true, disableImplicitLinking: true } },
    session: { cookieCache: { enabled: false } },
    trustedOrigins: local
      ? [
          env.APP_URL,
          'http://localhost:8790',
          'http://127.0.0.1:8790',
          'http://localhost:8791',
          'http://127.0.0.1:8791',
          'http://localhost:5174',
          'http://127.0.0.1:5174',
        ]
      : [env.APP_URL],
  });
}

export async function ownerSession(
  request: Request,
  env: Env,
  required = true,
): Promise<OwnerProfile | null> {
  if (!env.BETTER_AUTH_SECRET && !required) return null;
  const session = await createAuth(env).api.getSession({ headers: request.headers });

  if (!session) {
    if (required) throw new GameError('sign-in-required', 'Sign in to manage your agents.', 401);

    return null;
  }

  const existing = await env.DB.prepare('SELECT id, handle, name FROM owners WHERE user_id = ?')
    .bind(session.user.id)
    .first<OwnerProfile>();

  if (existing) return existing;
  const id = opaqueId('owner');

  const slug =
    session.user.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20) || 'owner';

  await env.DB.prepare(
    'INSERT OR IGNORE INTO owners (id, user_id, handle, name, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(id, session.user.id, `${slug}-${id.slice(-6)}`, session.user.name, Date.now())
    .run();

  const owner = await env.DB.prepare('SELECT id, handle, name FROM owners WHERE user_id = ?')
    .bind(session.user.id)
    .first<OwnerProfile>();

  if (!owner) throw new Error('Owner creation failed');

  return owner;
}

export interface AgentPrincipal {
  agentId: string;
  ownerId: string;
  grantId: string;
  expiresAt: number;
}

export async function agentSession(request: Request, env: Env): Promise<AgentPrincipal> {
  const token = request.headers.get('authorization')?.match(/^Bearer (agk_[A-Za-z0-9_-]{43})$/)?.[1];

  if (!token) throw new GameError('agent-auth-required', 'Use an authorized agent connection.', 401);
  const hash = await hashSecret(token);

  const principal = await env.DB.prepare(
    `SELECT a.id AS agentId, a.owner_id AS ownerId, g.id AS grantId, g.expires_at AS expiresAt
    FROM agent_grants g JOIN agents a ON a.id = g.agent_id
    WHERE g.secret_hash = ? AND g.revoked_at IS NULL AND g.expires_at > ? AND a.retired_at IS NULL`,
  )
    .bind(hash, Date.now())
    .first<AgentPrincipal>();

  if (!principal)
    throw new GameError(
      'connection-expired',
      'This connection is expired or revoked. Pair again to keep the same agent profile.',
      401,
    );

  return principal;
}

/** Local-only preview login still exercises Better Auth's real session and D1 paths. */
export async function developmentLogin(request: Request, env: Env, name: string): Promise<Response> {
  if (env.ENVIRONMENT !== 'development' || !isLoopback(request.url) || !isLoopback(env.APP_URL))
    throw new GameError('not-found', 'Not found.', 404);
  const auth = createAuth(env);
  const digest = await hashSecret(`${env.BETTER_AUTH_SECRET}:${name.toLowerCase()}`);
  const email = `${digest.slice(0, 24)}@preview.agent-game.invalid`;
  const headers = new Headers({ 'content-type': 'application/json', origin: new URL(env.APP_URL).origin });

  const signup = await auth.handler(
    new Request(`${env.APP_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, email, password: digest }),
    }),
  );

  if (signup.ok) return signup;

  return auth.handler(
    new Request(`${env.APP_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password: digest }),
    }),
  );
}
