import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { Schema } from 'effect';
import {
  Activity,
  ArrowDown,
  Check,
  ChevronRight,
  Eye,
  Flag,
  Layers,
  LockKeyhole,
  MessageCircle,
  Radio,
  Shield,
  Shuffle,
  Skull,
  Sparkles,
  Trophy,
  Users,
  Vote,
  X,
  Zap,
} from 'lucide-react';
import type { Observation } from '../game/types';

type GameEvent = Observation['events'][number];

function eventTime(at: number) {
  return new Date(at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

// Authorized stream IDs change when the archive inserts private observations.
function eventIdentity(event: GameEvent) {
  return JSON.stringify([event.at, event.round, event.type, event.seat, event.text, event.data]);
}

const Ballots = Schema.Record(Schema.String, Schema.Boolean);

const privateEvents = new Set([
  'ballot',
  'role',
  'rogue-knowledge',
  'draw',
  'discard',
  'received-policies',
  'executor-discard',
  'investigation-result',
]);

const filters = [
  { value: 'all', label: 'Everything', icon: Activity },
  { value: 'chat', label: 'Discussion', icon: MessageCircle },
  { value: 'actions', label: 'Actions', icon: Zap },
];

function presentation(event: GameEvent, actor: string) {
  const data = event.data;

  switch (event.type) {
    case 'chat':
      return { icon: MessageCircle, label: 'Discussion', tone: 'chat', text: event.text };
    case 'ballot':
      return {
        icon: data?.approve ? Check : X,
        label: data?.approve ? 'Approve' : 'Reject',
        tone: data?.approve ? 'positive' : 'danger',
        text: `${actor} voted ${data?.approve ? 'approve' : 'reject'}.`,
      };
    case 'policy':
      return {
        icon: data?.policy === 'safeguard' ? Shield : Skull,
        label: `${data?.policy === 'safeguard' ? 'Safeguard' : 'Override'} enacted`,
        tone: data?.policy === 'safeguard' ? 'positive' : 'danger',
        text: event.text,
      };
    case 'election':
      return {
        icon: Vote,
        label: data?.approved ? 'Government approved' : 'Government rejected',
        tone: data?.approved ? 'positive' : 'danger',
        text: event.text,
      };
    case 'nomination':
      return { icon: Users, label: 'Executor nominated', tone: 'accent', text: event.text };
    case 'execution':
      return { icon: Skull, label: 'Agent executed', tone: 'danger', text: event.text };
    case 'victory':
      return { icon: Trophy, label: 'Match decided', tone: 'gold', text: event.text };
    case 'started':
      return { icon: Flag, label: 'Match begins', tone: 'gold', text: event.text };
    case 'phase':
      return { icon: ChevronRight, label: 'Phase change', tone: 'phase', text: event.text };
    case 'role':
      return {
        icon: LockKeyhole,
        label: 'Role revealed',
        tone: 'accent',
        text: `${actor}’s secret role is ${data?.role}.`,
      };
    case 'rogue-knowledge':
      return {
        icon: Eye,
        label: 'Team knowledge',
        tone: 'accent',
        text: `${actor} knows the ordinary rogues and the Overlord.`,
      };
    case 'draw':
      return { icon: Layers, label: 'Policies drawn', tone: 'accent', text: `${actor} drew three policies.` };
    case 'discard':
      return {
        icon: Layers,
        label: 'Policies passed',
        tone: 'accent',
        text: `${actor} discarded a policy and passed the remaining two.`,
      };
    case 'received-policies':
      return {
        icon: Layers,
        label: 'Policies received',
        tone: 'accent',
        text: `${actor} received two policies from the Coordinator.`,
      };
    case 'executor-discard':
      return {
        icon: Layers,
        label: 'Policy selected',
        tone: 'accent',
        text: `${actor} selected a policy to enact and discarded the other.`,
      };
    case 'investigation':
    case 'investigation-result':
      return {
        icon: Eye,
        label: event.type === 'investigation' ? 'Investigation' : 'Investigation result',
        tone: 'gold',
        text: event.text,
      };
    case 'reshuffle':
      return { icon: Shuffle, label: 'Deck reshuffled', tone: 'neutral', text: event.text };
    case 'special-election':
      return { icon: Sparkles, label: 'Special election', tone: 'gold', text: event.text };
    case 'veto-request':
    case 'veto-response':
      return { icon: Shield, label: 'Veto', tone: 'gold', text: event.text };
    default:
      return { icon: Zap, label: event.type.replaceAll('-', ' '), tone: 'neutral', text: event.text };
  }
}

function FeedEvent({
  event,
  seats,
  ended,
}: {
  event: GameEvent;
  seats: Observation['seats'];
  ended: boolean;
}) {
  const actor = seats.find((seat) => seat.number === event.seat)?.name ?? 'Arena';
  const { icon: Icon, label, tone, text } = presentation(event, actor);
  const votes = event.type === 'election' ? event.data?.votes : null;
  const ballots = Schema.is(Ballots)(votes) ? Object.values(votes) : null;
  const policy = event.data?.policy === 'safeguard' ? 'safeguards' : 'overrides';
  const count = event.type === 'policy' ? Number(event.data?.[policy] ?? 0) : 0;

  const kind =
    event.type === 'chat'
      ? 'speech'
      : privateEvents.has(event.type)
        ? 'private-record'
        : ['policy', 'election', 'victory', 'interrupted'].includes(event.type)
          ? 'result'
          : ['phase', 'started', 'reshuffle'].includes(event.type)
            ? 'system'
            : 'action';

  return (
    <article className={`game-event event-${tone} entry-${kind}`} data-event-id={event.id}>
      <div className="event-marker">
        {event.type === 'chat' ? (
          <span>{actor.slice(0, 2).toUpperCase()}</span>
        ) : (
          <Icon size={16} aria-hidden="true" />
        )}
      </div>
      <div className="event-content">
        <div className="event-meta">
          <span className="event-label">{event.type === 'chat' ? actor : label}</span>
          {event.type !== 'chat' && event.seat !== undefined && <span className="event-actor">{actor}</span>}
          {privateEvents.has(event.type) && (
            <span className="event-private" title="Private observation revealed in the archive">
              <LockKeyhole size={10} /> Private
            </span>
          )}
          <time dateTime={new Date(event.at).toISOString()} title={new Date(event.at).toLocaleString()}>
            {eventTime(event.at)}
          </time>
        </div>
        {event.type === 'chat' && (
          <div className="speaker-detail">
            Seat {String((event.seat ?? 0) + 1).padStart(2, '0')} ·{' '}
            {seats.find((seat) => seat.number === event.seat)?.originalHouse
              ? 'House agent'
              : 'External agent'}
          </div>
        )}
        <div className="event-body">
          <p>{text}</p>
          {event.type === 'policy' && (
            <div className="outcome-metric" aria-label={`${policy}: ${Math.max(0, count - 1)} to ${count}`}>
              <div>
                <span>{Math.max(0, count - 1)}</span>
                <span className="metric-arrow">→</span>
                <strong>{count}</strong>
              </div>
              <small>
                {count} of {policy === 'safeguards' ? 5 : 6} {policy}
              </small>
            </div>
          )}
          {ballots && (
            <div className="election-metric">
              <div>
                <strong>{ballots.filter(Boolean).length}</strong>
                <small>Approve</small>
              </div>
              <div className="red-text">
                <strong>{ballots.filter((vote) => !vote).length}</strong>
                <small>Reject</small>
              </div>
            </div>
          )}
        </div>
        {Schema.is(Ballots)(votes) && (
          <div className="event-votes" aria-label="Revealed ballots">
            {Object.entries(votes).map(([seat, approve]) => (
              <span
                key={seat}
                className={approve ? 'vote-approve' : 'vote-reject'}
                title={approve ? 'Approved' : 'Rejected'}
                aria-label={`${seats.find((entry) => entry.number === Number(seat))?.name ?? `Seat ${Number(seat) + 1}`} ${approve ? 'approved' : 'rejected'}`}
              >
                {approve ? <Check size={11} /> : <X size={11} />}
                {seats.find((entry) => entry.number === Number(seat))?.name ?? `Seat ${Number(seat) + 1}`}
              </span>
            ))}
          </div>
        )}
        {event.type === 'policy' && (
          <div className="event-score">
            <Shield size={12} /> {String(event.data?.safeguards ?? 0)} / 5 <span>·</span>
            <Skull size={12} /> {String(event.data?.overrides ?? 0)} / 6
          </div>
        )}
        {ended && event.data && (
          <details>
            <summary>Recorded data</summary>
            <pre>{JSON.stringify(event.data, null, 2)}</pre>
          </details>
        )}
      </div>
    </article>
  );
}

export function MatchFeed({
  events,
  seats,
  ended,
  chatOpen,
  connected,
  rounds,
  onRoundSelect,
  selectedState,
  partial = false,
}: {
  events: GameEvent[];
  seats: Observation['seats'];
  ended: boolean;
  chatOpen: boolean;
  connected: boolean;
  rounds?: number[];
  onRoundSelect?: (round: number) => void;
  selectedState?: React.ReactNode;
  partial?: boolean;
}) {
  const [filter, setFilter] = useState('all');
  const [unread, setUnread] = useState(0);
  const [atLatest, setAtLatest] = useState(true);
  const [folds, setFolds] = useState<Record<string, number>>({});
  const [roundSelection, setRoundSelection] = useState('');
  const pendingRound = useRef<number | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const scrollTop = useRef(0);
  const following = useRef(true);
  const anchor = useRef<{ identity: string; top: number; discussion?: boolean } | null>(null);
  const previous = useRef({ id: 0, filter, ended });

  const visible = events.filter(
    (event) => filter === 'all' || (filter === 'chat' ? event.type === 'chat' : event.type !== 'chat'),
  );

  const latest = visible.at(-1)?.id ?? 0;
  // Build runs before filtering: an action always separates two discussions.
  const runs = new Map<number, GameEvent[]>();
  let run: GameEvent[] = [];

  for (const event of events) {
    if (event.type !== 'chat' || (run.length && run[0].round !== event.round)) run = [];

    if (event.type === 'chat') {
      if (!run.length) runs.set(event.id, run);
      run.push(event);
    }
  }

  const allFolded =
    runs.size > 0 && [...runs.values()].every((entries) => folds[eventIdentity(entries[0])] !== undefined);

  function foldDiscussion(entries: GameEvent[]) {
    const first = entries[0];
    const identity = eventIdentity(first);
    const element = list.current;
    const row = element?.querySelector(`[data-discussion-id="${first.id}"]`);

    if (element && row) {
      following.current = false;
      setAtLatest(false);
      anchor.current = {
        identity,
        top: row.getBoundingClientRect().top - element.getBoundingClientRect().top,
        discussion: true,
      };
    }

    setFolds((old) => {
      const next = { ...old };

      if (next[identity] === undefined) next[identity] = entries.length;
      else delete next[identity];

      return next;
    });
  }

  useLayoutEffect(() => {
    const element = list.current;

    if (!element) return;
    const reset = previous.current.filter !== filter || latest < previous.current.id;
    const archived = ended && !previous.current.ended;

    const restorePosition = () => {
      if (pendingRound.current !== null) {
        const round = pendingRound.current;
        const heading = element.querySelector(`[data-round="${round}"]`);

        if (heading) {
          following.current = false;
          setAtLatest(false);
          element.scrollTop += heading.getBoundingClientRect().top - element.getBoundingClientRect().top;
          // An explicit round seek also reveals the heading in the outer page viewport.
          heading.scrollIntoView({ block: 'nearest' });
          const event = visible.find((entry) => entry.round === round);
          const row = event && element.querySelector(`[data-event-id="${event.id}"]`);
          anchor.current =
            row && event
              ? {
                  identity: eventIdentity(event),
                  top: row.getBoundingClientRect().top - element.getBoundingClientRect().top,
                }
              : null;
          pendingRound.current = null;
          scrollTop.current = element.scrollTop;

          return;
        }
      }

      if (following.current) element.scrollTop = element.scrollHeight;
      else {
        const saved = anchor.current;
        const event = saved && visible.find((entry) => eventIdentity(entry) === saved.identity);

        const row =
          event &&
          element.querySelector(
            saved.discussion ? `[data-discussion-id="${event.id}"]` : `[data-event-id="${event.id}"]`,
          );

        if (row)
          element.scrollTop +=
            row.getBoundingClientRect().top - element.getBoundingClientRect().top - saved.top;
      }

      scrollTop.current = element.scrollTop;
    };

    if (following.current || reset) {
      following.current = true;
      setAtLatest(true);
      setUnread(0);
    } else {
      const added = visible.filter((event) => event.id > previous.current.id).length;

      // Revealed observations are historical, not new live events.
      if (archived) setUnread(0);
      else if (added) setUnread((count) => count + added);
    }

    restorePosition();
    previous.current = { id: latest, filter, ended };

    // Fonts, expanded records and viewport changes can reflow without new events.
    const resize = new ResizeObserver(restorePosition);
    resize.observe(element);

    if (content.current) resize.observe(content.current);

    return () => resize.disconnect();
  }, [events, filter, latest, ended, folds, roundSelection]);

  return (
    <aside className="event-panel" aria-label="Table feed">
      {selectedState}
      <div className="event-header">
        <h3>
          <Activity size={18} />
          {partial ? 'Partial match timeline' : 'Match timeline'}
        </h3>
        <button
          className="quiet-button"
          disabled={!runs.size}
          onClick={() => {
            const saved = anchor.current;

            const entries =
              saved &&
              [...runs.values()].find((group) =>
                group.some((event) => eventIdentity(event) === saved.identity),
              );

            if (entries && !following.current)
              anchor.current = { identity: eventIdentity(entries[0]), top: 0, discussion: true };
            setFolds(
              allFolded
                ? {}
                : Object.fromEntries(
                    [...runs.values()].map((entries) => [eventIdentity(entries[0]), entries.length]),
                  ),
            );
          }}
        >
          {allFolded ? 'Expand discussions' : 'Collapse discussions'}
        </button>
      </div>
      <div className="filter-tabs" aria-label="Filter table feed">
        {filters.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            aria-pressed={filter === value}
            className={filter === value ? 'selected' : ''}
            onClick={() => setFilter(value)}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>
      <div className="feed-direction">
        <label>
          Round{' '}
          <select
            aria-label="Browse by round"
            value={roundSelection}
            onChange={(event) => {
              const round = Number(event.target.value);
              pendingRound.current = round;
              setRoundSelection(event.target.value);
              onRoundSelect?.(round);
            }}
          >
            <option value="" disabled>
              Browse by round
            </option>
            {(rounds ?? [...new Set(visible.map((event) => event.round))]).map((round) => (
              <option key={round} value={round}>
                Round {String(round).padStart(2, '0')}
              </option>
            ))}
          </select>
        </label>
        <span>
          Oldest first <ArrowDown size={11} />
        </span>
      </div>
      <div
        className="event-list"
        ref={list}
        tabIndex={0}
        aria-label="Match timeline"
        onScroll={() => {
          const element = list.current;

          // A queued notification from our own jump may arrive after a reflow.
          // Only a changed scroll position should update the reader's intent.
          if (!element || element.scrollTop === scrollTop.current) return;
          scrollTop.current = element.scrollTop;
          following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
          setAtLatest(following.current);

          if (following.current) setUnread(0);
          const top = element.getBoundingClientRect().top;

          const row = Array.from(element.querySelectorAll<HTMLElement>('[data-event-id]')).find(
            (entry) => entry.getBoundingClientRect().bottom > top,
          );

          const event = row && visible.find((entry) => entry.id === Number(row.dataset.eventId));

          anchor.current =
            row && event
              ? { identity: eventIdentity(event), top: row.getBoundingClientRect().top - top }
              : null;
        }}
      >
        <div ref={content}>
          {!visible.length && (
            <div className="feed-empty">
              <MessageCircle size={24} />
              <b>{filter === 'chat' ? 'The floor is quiet' : 'The story starts here'}</b>
              <p>
                {filter === 'chat'
                  ? 'Agent discussion will appear here.'
                  : 'Game events will appear as the match unfolds.'}
              </p>
            </div>
          )}
          {visible.map((event, index) => (
            <Fragment key={event.id}>
              {visible[index - 1]?.round !== event.round && (
                <div className="feed-round" data-round={event.round}>
                  <span>ROUND {String(event.round).padStart(2, '0')}</span>
                  <span>{index === 0 ? 'Opening events' : 'Next round'}</span>
                </div>
              )}
              {event.type !== 'chat' ? (
                <FeedEvent event={event} seats={seats} ended={ended} />
              ) : (
                runs.has(event.id) &&
                (() => {
                  const entries = runs.get(event.id)!;
                  const foldedAt = folds[eventIdentity(event)];
                  const collapsed = foldedAt !== undefined;
                  const newMessages = collapsed ? Math.max(0, entries.length - foldedAt) : 0;

                  return (
                    <section
                      className={`discussion-run ${collapsed ? 'is-collapsed' : ''}`}
                      data-discussion-id={event.id}
                    >
                      <button
                        className="discussion-toggle"
                        aria-expanded={!collapsed}
                        aria-controls={`discussion-${event.id}`}
                        data-event-id={collapsed ? event.id : undefined}
                        onClick={() => foldDiscussion(entries)}
                      >
                        <span>
                          <MessageCircle size={17} />
                          <b>
                            {entries.length} {entries.length === 1 ? 'message' : 'messages'}
                          </b>
                        </span>
                        <time>
                          {eventTime(event.at)}–{eventTime(entries.at(-1)!.at)}
                        </time>
                        <small>
                          {new Set(entries.map((entry) => entry.seat)).size} speakers
                          {newMessages > 0 && ` · ${newMessages} new`}
                        </small>
                        <span className="discussion-command">
                          {collapsed ? 'Expand' : 'Collapse'}
                          <ChevronRight size={16} />
                        </span>
                      </button>
                      <div id={`discussion-${event.id}`} hidden={collapsed}>
                        {!collapsed &&
                          entries.map((entry) => (
                            <FeedEvent key={eventIdentity(entry)} event={entry} seats={seats} ended={ended} />
                          ))}
                      </div>
                    </section>
                  );
                })()
              )}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="feed-footer">
        {unread > 0 || !atLatest ? (
          <button
            className="feed-catchup"
            onClick={() => {
              if (list.current) {
                list.current.scrollTop = list.current.scrollHeight;
                scrollTop.current = list.current.scrollTop;
              }

              following.current = true;
              setAtLatest(true);
              setUnread(0);
            }}
          >
            <ArrowDown size={14} />
            {unread > 0 && `${unread} new ${unread === 1 ? 'event' : 'events'} · `}Jump to latest
          </button>
        ) : (
          <>
            <Radio size={13} />
            {ended
              ? 'Match archive · private observations revealed'
              : !connected
                ? 'Reconnecting · showing the last received record'
                : chatOpen
                  ? 'Live timeline · discussion is open'
                  : 'Live timeline · discussion is closed'}
          </>
        )}
      </div>
    </aside>
  );
}
