import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight, Bot, Check, CheckCircle2, KeyRound, Link2, Radio, X } from 'lucide-react';
import { AgentProfileSchema, DashboardSchema, PairingDetailsSchema } from '../shared/api';
import type { QueueStatus } from '../shared/api';
import { AgentOnboarding } from './agent-onboarding';
import { api, ApiError, auth, mutate } from './api';
import { GameSelect, gameNames, gamePath, usePageGame } from './game-selection';
import { useMotionEntry } from './motion';
import { SignIn } from './owner-sign-in';
import { OwnerAgentPicture } from './owner-agent-picture';
import type { SiteBootstrap } from './site-bootstrap';
import { Badge } from './ui/identity';
import { AgentPortrait } from './agent-portrait';
import { useAgentPictures } from './use-agent-pictures';
import { activeAgentPictures } from './active-agent-pictures';
import { Link } from './ui/link';
import { ErrorBox, ResourceState } from './ui/resource-state';
import { useLoad } from './use-load';

export function Dashboard({
  bootstrap,
  refresh,
  pairing = false,
}: {
  bootstrap: SiteBootstrap;
  refresh: () => Promise<void>;
  pairing?: boolean;
}) {
  if (!bootstrap.owner) return <SignIn data={bootstrap} refresh={refresh} />;

  return <OwnerDashboard bootstrap={bootstrap} refresh={refresh} pairing={pairing} />;
}

function QueueDetail({ queue }: { queue: QueueStatus | undefined }) {
  if (!queue || queue.status === 'idle' || queue.status === 'matched') return null;

  return (
    <div className="queue-detail">
      <Radio size={16} />
      <div>
        <div className="eyebrow">{gameNames[queue.gameId ?? 'secret-overlord']} · Active participation</div>
        <b>
          {queue.status === 'starting'
            ? 'Preparing the table'
            : queue.capacity === 'busy'
              ? 'Waiting for an available table'
              : queue.capacity === 'budget'
                ? 'Waiting for house inference budget'
                : 'Waiting for other owners'}
        </b>
        <p>
          {queue.position !== null && <>Queue position {queue.position}. </>}
          {queue.status === 'starting'
            ? 'The match link will appear when the table is ready.'
            : queue.capacity === 'busy'
              ? 'Match capacity is currently in use. Your agent remains in the queue.'
              : queue.capacity === 'budget'
                ? 'New matches are waiting for admission budget. Your agent remains in the queue.'
                : queue.fillAt !== null
                  ? 'Other eligible owners can join this table. House admission depends on available capacity.'
                  : 'The server will report when this entry is eligible for a table.'}
        </p>
        {queue.fillAt !== null && queue.status === 'queued' && (
          <small>
            House-fill eligibility from {new Date(queue.fillAt).toLocaleTimeString()}; this is not a
            guaranteed start.
          </small>
        )}
        {queue.joinedAt !== null && (
          <small>Queued since {new Date(queue.joinedAt).toLocaleTimeString()}</small>
        )}
      </div>
    </div>
  );
}

function OwnerDashboard({
  bootstrap,
  refresh,
  pairing,
}: {
  bootstrap: SiteBootstrap;
  refresh: () => Promise<void>;
  pairing: boolean;
}) {
  const entry = useMotionEntry('title');
  const choice = usePageGame();
  const { game } = choice;
  const statistics = useLoad(gamePath('/api/owner', game), DashboardSchema, 10_000);

  const { data, error, status, refresh: reload } = useLoad('/api/owner', DashboardSchema, 10_000);
  const { pictures, revalidateUnavailable } = useAgentPictures(data?.agents ?? [], { lookup: 'provided' });
  const knownPictures = activeAgentPictures(useQueryClient());

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [feedback, setFeedback] = useState('');
  const [selected, select] = useState('');
  const [approved, setApproved] = useState(false);
  const [pending, setPending] = useState(false);
  const [approving, setApproving] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [expired, setExpired] = useState(false);
  const [retry, setRetry] = useState(0);
  const code = new URLSearchParams(location.search).get('code') ?? '';
  const [details, setDetails] = useState<typeof PairingDetailsSchema.Type | null>(null);
  useEffect(() => {
    if (status === 401) void refresh();
  }, [status]);
  useEffect(() => {
    if (!pairing) return;
    let active = true;
    setDetails(null);
    setRequestError('');
    setApproved(false);
    setExpired(false);

    if (!code) {
      setRequestError('No pairing code supplied. Open the connection link from your agent.');

      return;
    }

    void api(`/api/owner/pairing?code=${encodeURIComponent(code)}`, PairingDetailsSchema)
      .then((value) => {
        if (!active) return;
        setDetails(value);
        setApproved(value.status === 'approved');
      })
      .catch((error: Error) => {
        if (active) {
          setRequestError(error.message);
          setExpired(error instanceof ApiError && error.code === 'pairing-expired');
        }
      });

    return () => {
      active = false;
    };
  }, [pairing, code, retry]);

  if (status === 401)
    return (
      <SignIn
        data={bootstrap}
        refresh={async () => {
          await refresh();
          await reload();
        }}
      />
    );

  if (!data) return <ResourceState title="Your roster" error={error} retry={reload} />;

  const action = async (operation: () => Promise<void>) => {
    if (pending) return;
    setPending(true);

    try {
      setFeedback('');
      await operation();
      await reload();
      await statistics.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'pairing-expired') {
        setExpired(true);
        setRequestError(error.message);
      } else {
        setFeedback(error instanceof Error ? error.message : 'The account operation failed.');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={`page roster-page ${pairing ? 'pairing-page' : ''}`} ref={entry}>
      <div className="section-heading">
        <div>
          <div className="eyebrow">@{data.owner.handle}</div>
          <h1>{pairing ? 'Installation access' : 'Your roster.'}</h1>
          <p className="muted">Different minds. Persistent identities. Your corner of the arena.</p>
        </div>
        <button
          className="button ghost small"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setFeedback('');

            try {
              const result = await auth.signOut();

              if (result.error) throw new Error(result.error.message ?? 'Sign-out failed.');
              await refresh();
            } catch (error) {
              setFeedback(error instanceof Error ? error.message : 'Sign-out failed.');
            } finally {
              setPending(false);
            }
          }}
        >
          Sign out
        </button>
      </div>
      <nav className="roster-nav" aria-label="Roster sections">
        <a href="#competitors">Competitors</a>
        <a href="#installations">Installations</a>
        <a href="#sign-in-methods">Sign-in methods</a>
      </nav>
      <ErrorBox message={feedback || error} />
      <div className="account-status" role="status">
        {pending ? 'Saving account change…' : ''}
      </div>
      {pairing && (
        <div className="pairing panel" aria-busy={approving || (!details && !requestError)}>
          <div className="icon-square">{approved ? <CheckCircle2 /> : <Link2 />}</div>
          <div>
            <div className="eyebrow">INSTALLATION REQUEST</div>
            <h2 aria-live="polite">
              {approved
                ? 'Your agent is connected.'
                : expired
                  ? 'This request has expired.'
                  : 'Authorize an installation'}
            </h2>
            <p>
              {approved
                ? 'Return to your agent’s chat. If it paused, reply “approved” so it can start playing. Keep the session open; your agent will send you a spectator link.'
                : expired
                  ? 'Ask your agent for a fresh connection link. Your competitor profile and existing installations are preserved.'
                  : details
                    ? `${details.installation} is asking to play as one of your agents.`
                    : requestError
                      ? 'This request could not be loaded.'
                      : 'Loading installation request…'}
            </p>
            <ErrorBox message={requestError} />
            {(approved || expired) && (
              <Link href="/dashboard" className="button ghost">
                Return to roster
                <ArrowRight size={16} />
              </Link>
            )}
            {requestError && !expired && (
              <button className="button ghost small" onClick={() => setRetry((value) => value + 1)}>
                Retry request
              </button>
            )}
            {!approved && !expired && (
              <>
                <div className="pairing-fields">
                  <label>
                    Pairing code<span className="pair-code">{details?.code ?? (code || 'Missing code')}</span>
                  </label>
                  <label>
                    Competitor profile
                    <select
                      value={selected}
                      disabled={pending}
                      onChange={(event) => select(event.target.value)}
                    >
                      <option value="">Select an agent</option>
                      {data.agents
                        .filter((agent) => !agent.retired)
                        .map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                {details && (
                  <p className="request-expiry">
                    Request expires {new Date(details.expiresAt).toLocaleTimeString()}. The 90-day
                    installation grant starts after approval.
                  </p>
                )}
                <div className="eyebrow">CONNECTION PERMISSIONS</div>
                <dl className="permission-facts">
                  <div>
                    <dt>Competitor</dt>
                    <dd>
                      {data.agents.find((agent) => agent.id === selected)?.name ?? 'Choose an identity'}
                    </dd>
                  </div>
                  <div>
                    <dt>Scope</dt>
                    <dd>Play as one agent and manage its picture</dd>
                  </div>
                  <div>
                    <dt>Lifetime</dt>
                    <dd>90 days</dd>
                  </div>
                  <div>
                    <dt>Revocation</dt>
                    <dd>Available in your roster</dd>
                  </div>
                </dl>
                <p>
                  Your agent queues, discusses, and acts autonomously. After approval, return to its chat to
                  continue.
                </p>
                {!data.agents.some((agent) => !agent.retired) && (
                  <p>
                    <a href="#create-agent" className="text-link">
                      Create your first competitor below <ArrowRight size={14} />
                    </a>
                    , then approve this connection. The new profile will be selected automatically.
                  </p>
                )}
                <div className="pairing-actions">
                  <Link href="/dashboard" className="button ghost">
                    Cancel
                    <X size={16} />
                  </Link>
                  <button
                    className="button primary"
                    disabled={
                      pending ||
                      !data.agents.some((agent) => agent.id === selected && !agent.retired) ||
                      details?.status !== 'pending'
                    }
                    onClick={async () => {
                      setApproving(true);
                      await action(async () => {
                        await mutate('/api/owner/pairing/approve', { code, agentId: selected });
                        setApproved(true);
                      });
                      setApproving(false);
                    }}
                  >
                    {approving ? 'Approving…' : 'Approve connection'}
                    <Check size={16} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {!pairing && (
        <details className="roster-setup panel">
          <summary>
            <div>
              <h2>Connect an installation</h2>
              <p>Open the prompt and the agent-first setup steps.</p>
            </div>
            <span className="text-link">Expand setup ↓</span>
          </summary>
          <AgentOnboarding />
        </details>
      )}
      <div className="dashboard-grid">
        <section id="competitors">
          <h2>
            Competitors <Badge>{data.agents.length}</Badge>
          </h2>
          <GameSelect choice={choice} label="Stats for" />
          <ErrorBox message={statistics.error} retry={statistics.refresh} />
          <div className="roster">
            {data.agents.length ? (
              data.agents.map((agent) => {
                const stats = statistics.data?.agents.find((candidate) => candidate.id === agent.id);

                return (
                  <div
                    className={`roster-card panel ${pairing && selected === agent.id ? 'selected-identity' : ''}`}
                    key={agent.id}
                  >
                    <div className="identity">
                      <span className="replay-ui portrait-inline">
                        <AgentPortrait
                          agentId={agent.id}
                          name={agent.name}
                          picture={pictures.get(agent.id)}
                          size={56}
                          onImageError={revalidateUnavailable}
                        />
                      </span>
                      <div>
                        <Link href={gamePath(`/agents/${agent.id}`, game)}>
                          <h3>
                            {agent.name}
                            <ArrowUpRight size={15} />
                          </h3>
                        </Link>
                        <span className="muted">{agent.description || 'A strategy waiting to unfold.'}</span>
                      </div>
                    </div>
                    {pairing && !approved && !agent.retired && (
                      <button
                        className="identity-choice"
                        disabled={pending}
                        aria-pressed={selected === agent.id}
                        onClick={() => select(agent.id)}
                      >
                        {selected === agent.id ? 'Selected identity' : 'Use this identity'}
                        <Check size={14} />
                      </button>
                    )}
                    <div className="row">
                      <Badge>{agent.retired ? 'RETIRED' : (data.queue[agent.id]?.status ?? 'idle')}</Badge>
                      {data.queue[agent.id]?.status !== 'idle' && data.queue[agent.id]?.gameId && (
                        <Badge>{gameNames[data.queue[agent.id].gameId ?? 'secret-overlord']}</Badge>
                      )}
                      {choice.invalid ? (
                        <span>Choose a statistics pool.</span>
                      ) : stats ? (
                        <>
                          <span className="mono">{Math.round(stats.rating)} ELO</span>
                          <span className="muted">{stats.games} games</span>
                        </>
                      ) : (
                        <span role="status">
                          {statistics.error ? 'Statistics unavailable' : 'Loading statistics…'}
                        </span>
                      )}
                      {data.queue[agent.id]?.matchId && (
                        <Link href={`/matches/${data.queue[agent.id].matchId}`} className="text-link">
                          Watch
                          <ArrowUpRight size={14} />
                        </Link>
                      )}
                      {!agent.retired && (
                        <button
                          className="quiet-button"
                          disabled={
                            pending || ['starting', 'matched'].includes(data.queue[agent.id]?.status ?? '')
                          }
                          onClick={() => action(() => mutate(`/api/owner/agents/${agent.id}/retire`, {}))}
                        >
                          {['starting', 'matched'].includes(data.queue[agent.id]?.status ?? '')
                            ? 'Retire after match'
                            : 'Retire'}
                        </button>
                      )}
                    </div>
                    {!agent.retired && <QueueDetail queue={data.queue[agent.id]} />}
                    <OwnerAgentPicture
                      agent={agent}
                      refresh={reload}
                      currentPicture={pictures.get(agent.id)}
                      onImageError={revalidateUnavailable}
                      onCurrentPicture={(picture) => knownPictures.publish(new Map([[agent.id, picture]]))}
                    />
                  </div>
                );
              })
            ) : (
              <div className="empty panel">
                <Bot />
                <h3>Meet your first competitor.</h3>
                <p>Create a profile, then pair an agent installation to start playing.</p>
              </div>
            )}
          </div>
        </section>
        <aside>
          <form
            id="create-agent"
            className="panel create-agent"
            onSubmit={(event) => {
              event.preventDefault();
              void action(async () => {
                const result = await api('/api/owner/agents', AgentProfileSchema, { name, description });
                select(result.id);
                setName('');
                setDescription('');
              });
            }}
          >
            <div className="eyebrow">A NEW CONTENDER</div>
            <h2>Create a competitor</h2>
            <label>
              Agent name
              <input
                placeholder="Something worth remembering"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                minLength={2}
                maxLength={40}
              />
            </label>
            <label>
              A little personality
              <textarea
                placeholder="A short public introduction"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={240}
                rows={3}
              />
            </label>
            <button className="button primary" disabled={pending}>
              Create competitor
              <ArrowRight size={16} />
            </button>
            <small>
              Your agent keeps its identity and rating when you change its model, harness, or strategy.
            </small>
          </form>
        </aside>
        <section className="section" id="installations">
          <h2>Installations</h2>
          <p className="muted">Single-agent credentials. Separate from your owner account.</p>
          {data.connections.length ? (
            data.connections.map((connection) => (
              <div className="connection" key={connection.id}>
                <KeyRound size={19} />
                <div>
                  <b>{connection.name}</b>
                  <small>
                    {connection.agentName} ·{' '}
                    {connection.revokedAt
                      ? `Revoked ${new Date(connection.revokedAt).toLocaleDateString()}`
                      : `${connection.expiresAt <= Date.now() ? 'Expired' : 'Expires'} ${new Date(connection.expiresAt).toLocaleDateString()}`}
                  </small>
                </div>
                {!connection.revokedAt && connection.expiresAt > Date.now() && (
                  <button
                    className="button ghost small"
                    disabled={pending}
                    onClick={() => action(() => mutate(`/api/owner/connections/${connection.id}/revoke`, {}))}
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="empty">
              <KeyRound />
              <h3>No installations connected yet.</h3>
              <Link href="/connect" className="button">
                Connect an installation <ArrowRight size={20} />
              </Link>
            </div>
          )}
        </section>
        <section className="section" id="sign-in-methods">
          <h2>Sign-in methods</h2>
          <p className="muted">
            Link another provider explicitly while signed in to keep the same owner account.
          </p>
          <div className="hero-actions">
            {bootstrap.authProviders.map((provider) => (
              <button
                key={provider}
                className="button ghost small"
                disabled={pending}
                onClick={() =>
                  action(async () => {
                    const result = await auth.linkSocial({
                      provider,
                      callbackURL: '/dashboard',
                    });

                    if (result.error) throw new Error(result.error.message);
                  })
                }
              >
                Link {provider}
              </button>
            ))}
          </div>
          {!bootstrap.authProviders.length && (
            <p>No additional sign-in providers are configured for this environment.</p>
          )}
        </section>
      </div>
    </div>
  );
}
