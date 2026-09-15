import { APIError, createAuthEndpoint, createAuthMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { GameError } from '../game/types';
import { PreviewOwnerCompleteSchema } from '../shared/preview';
import { hashSecret } from './http';
import { openPreview, previewTarget } from './preview-config';
import { previewAuthority } from './preview-authority';
import { decodePreview, redeemPreview } from './preview-transport';
import { importPreviewMetadata } from './preview-import';
import { ownerPreviewPending, previewBrowserCookie } from './preview-target';

/** Target-only plugin. All library session routes share the same live source authority check. */
export function previewAuth(env: Env) {
  return {
    id: 'preview-source-authority',
    hooks: {
      before: [
        {
          matcher: () => true,
          handler: createAuthMiddleware(async (ctx) => {
            // Server-side api.getSession supplies no method; it is still the read-only get-session endpoint.
            const method = ctx.method ?? (ctx.path === '/get-session' ? 'GET' : 'POST');

            if (
              (method !== 'GET' || ctx.headers?.has('origin')) &&
              ctx.headers?.get('origin') !== env.APP_URL
            )
              throw new APIError('FORBIDDEN', { message: 'Use the exact preview origin.' });

            if (ctx.path === '/preview/complete') return;

            if (
              ![
                '/get-session',
                '/list-sessions',
                '/revoke-session',
                '/revoke-sessions',
                '/revoke-other-sessions',
                '/sign-out',
              ].includes(ctx.path ?? '')
            )
              throw new APIError('FORBIDDEN', { message: 'Sign in through the source preview handoff.' });

            const token = await ctx.getSignedCookie(
              ctx.context.authCookies.sessionToken.name,
              ctx.context.secret,
            );

            if (!token) return;
            const session = await ctx.context.internalAdapter.findSession(token);

            if (!session || session.session.expiresAt.getTime() <= Date.now()) return;

            try {
              await previewAuthority(env, 'session', session.session.id);
            } catch {
              throw new APIError('UNAUTHORIZED', { message: 'Source session is unavailable or revoked.' });
            }
          }),
        },
      ],
    },
    endpoints: {
      completePreview: createAuthEndpoint(
        '/preview/complete',
        { method: 'POST', requireHeaders: true },
        async (ctx) => {
          try {
            const input = decodePreview(PreviewOwnerCompleteSchema, JSON.stringify(ctx.body));
            const pending = await ownerPreviewPending(env, input.requestId);
            const browser = ctx.getCookie(previewBrowserCookie(env, input.requestId));

            if (!browser || (await hashSecret(browser)) !== pending.browser_hash)
              throw new GameError('preview-browser', 'Complete sign-in in the initiating browser.', 401);

            const receipt = await redeemPreview(
              env,
              input.requestId,
              input.code,
              await openPreview(env, pending.encrypted_verifier),
            );

            if (receipt.scope !== 'owner')
              throw new GameError('preview-scope', 'Owner handoff required.', 401);
            const userId = await importPreviewMetadata(env, receipt);
            const token = await openPreview(env, pending.encrypted_token);
            let existing = await ctx.context.internalAdapter.findSession(token);

            if (!existing) {
              if (pending.session_committed)
                throw new GameError('preview-revoked', 'Target session was revoked.', 401);

              try {
                // Locked Better Auth 1.7.3 supports token override, but strips an overridden ID.
                await ctx.context.internalAdapter.createSession(
                  userId,
                  false,
                  {
                    token,
                    previewRequestId: pending.id,
                    expiresAt: new Date(Math.min(receipt.expiresAt, Date.now() + 7 * 86400000)),
                  },
                  true,
                );
              } catch (cause) {
                // Another completion can win the unique-token insert. Recover only that exact session.
                if (!(await ctx.context.internalAdapter.findSession(token))) throw cause;
              }

              existing = await ctx.context.internalAdapter.findSession(token);
            }

            if (
              !existing ||
              existing.user.id !== userId ||
              existing.session.expiresAt.getTime() <= Date.now()
            )
              throw new GameError('preview-session', 'Session completion failed.', 401);
            const target = await previewTarget(env);
            await env.DB.batch([
              env.DB.prepare(`INSERT OR IGNORE INTO preview_authorities VALUES ('session',?,?,?,?)`).bind(
                existing.session.id,
                receipt.requestId,
                target.incarnation,
                receipt.expiresAt,
              ),
              env.DB.prepare('UPDATE preview_pending SET session_committed=1 WHERE id=?').bind(pending.id),
            ]);
            await previewAuthority(env, 'session', existing.session.id);
            await setSessionCookie(ctx, existing, false, {
              maxAge: Math.max(0, Math.floor((existing.session.expiresAt.getTime() - Date.now()) / 1000)),
            });

            return ctx.json({ imported: true, ownerId: receipt.owner.id });
          } catch (cause) {
            if (cause instanceof GameError) {
              const status =
                cause.status >= 500
                  ? 'SERVICE_UNAVAILABLE'
                  : cause.status === 409
                    ? 'CONFLICT'
                    : cause.status === 401
                      ? 'UNAUTHORIZED'
                      : 'BAD_REQUEST';

              throw new APIError(status, { code: cause.code, message: cause.message });
            }

            throw cause;
          }
        },
      ),
    },
  };
}
