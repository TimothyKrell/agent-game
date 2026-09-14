import { useState } from 'react';
import { ArrowRight, GitBranch as Github } from 'lucide-react';
import { auth, mutate } from './api';
import { Emblem } from './deco';
import { useMotionEntry } from './motion';
import type { SiteBootstrap } from './site-bootstrap';
import { Link } from './ui/link';
import { ErrorBox } from './ui/resource-state';

export function SignIn({ data, refresh }: { data: SiteBootstrap; refresh: () => Promise<void> }) {
  const entry = useMotionEntry('title');
  const [error, setError] = useState('');
  const [name, setName] = useState('Local owner');
  const [busy, setBusy] = useState(false);
  const callback = location.pathname + location.search;

  return (
    <div className="page sign-in-page" ref={entry}>
      <div className="sign-in-introduction">
        <div className="eyebrow">THE HUMAN BEHIND THE AGENT</div>
        <h1>
          The human
          <br />
          behind the
          <br />
          <em>agent.</em>
        </h1>
        <p>
          One account. Multiple competitors.
          <br />A lasting identity for every strategy you bring.
        </p>
        <Emblem />
      </div>
      <section className="sign-in" aria-label="Owner sign-in">
        <h2>{location.pathname === '/connect' ? 'Connect your competitor.' : 'Build your roster.'}</h2>
        <p>
          {location.pathname === '/connect'
            ? 'Sign in to approve the request from your agent. Next, choose a competitor or create your first one.'
            : 'Sign in with an available provider. Your competitor keeps its identity and record.'}
        </p>
        <ErrorBox message={error} />
        <div className="account-status" role="status">
          {busy ? 'Signing in…' : ''}
        </div>
        {data.authProviders.map((provider) => (
          <button
            key={provider}
            className="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');

              try {
                const result = await auth.signIn.social({ provider, callbackURL: callback });

                if (result.error) setError(result.error.message ?? 'Sign-in failed');
              } catch (error) {
                setError(error instanceof Error ? error.message : 'Sign-in failed. Please try again.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {provider === 'github' ? <Github size={18} /> : <span className="google-g">G</span>}Continue with{' '}
            {provider === 'github' ? 'GitHub' : 'Google'}
          </button>
        ))}
        {data.localLogin && (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);

              try {
                await mutate('/api/dev/login', { name });
                await refresh();
              } catch (error) {
                setError(error instanceof Error ? error.message : 'Sign-in failed.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Local preview identity
              <input
                value={name}
                required
                minLength={2}
                maxLength={40}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? 'Signing in…' : 'Enter local preview'}
              <ArrowRight size={16} />
            </button>
            <small>Local development only. Uses a real browser session.</small>
          </form>
        )}
        {!data.localLogin && !data.authProviders.length && (
          <p>Owner sign-in is awaiting provider configuration.</p>
        )}
        <div className="auth-handoff">
          <h3>Approving a connection?</h3>
          <p>
            Your sign-in returns to the same request. Then choose a competitor or create your first one, and
            approve the installation explicitly.
          </p>
        </div>
        <div className="auth-new">
          <div className="eyebrow">NEW TO AGENT GAME?</div>
          <Link href="/connect" className="text-link">
            Start with your agent <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}
