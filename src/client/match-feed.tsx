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

  return (
    <article className={`game-event event-${tone}`} data-event-id={event.id}>
      <div className="event-marker">
        <Icon size={16} aria-hidden="true" />
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
            {new Date(event.at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </time>
        </div>
        <p>{text}</p>
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
}: {
  events: GameEvent[];
  seats: Observation['seats'];
  ended: boolean;
}) {
  const [filter, setFilter] = useState('all');
  const [unread, setUnread] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const scrollTop = useRef(0);
  const following = useRef(true);
  const anchor = useRef<{ identity: string; top: number } | null>(null);
  const previous = useRef({ id: 0, filter, ended });

  const visible = events.filter(
    (event) => filter === 'all' || (filter === 'chat' ? event.type === 'chat' : event.type !== 'chat'),
  );

  const latest = visible.at(-1)?.id ?? 0;

  useLayoutEffect(() => {
    const element = list.current;

    if (!element) return;
    const reset = previous.current.filter !== filter || latest < previous.current.id;
    const archived = ended && !previous.current.ended;

    const restorePosition = () => {
      if (following.current) element.scrollTop = element.scrollHeight;
      else {
        const saved = anchor.current;
        const event = saved && visible.find((entry) => eventIdentity(entry) === saved.identity);
        const row = event && element.querySelector(`[data-event-id="${event.id}"]`);

        if (row)
          element.scrollTop +=
            row.getBoundingClientRect().top - element.getBoundingClientRect().top - saved.top;
      }

      scrollTop.current = element.scrollTop;
    };

    if (following.current || reset) {
      following.current = true;
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
  }, [events, filter, latest, ended]);

  return (
    <aside className="event-panel" aria-label="Table feed">
      <div className="event-header">
        <h3>
          <Activity size={18} />
          Table feed
        </h3>
        <span className="mono">{events.length} EVENTS</span>
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
        <span>ROUND-BY-ROUND TIMELINE</span>
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
                <div className="feed-round">
                  <span>ROUND {String(event.round).padStart(2, '0')}</span>
                  <span>{index === 0 ? 'Opening events' : 'Next round'}</span>
                </div>
              )}
              <FeedEvent event={event} seats={seats} ended={ended} />
            </Fragment>
          ))}
        </div>
      </div>
      <div className="feed-footer">
        {unread > 0 ? (
          <button
            className="feed-catchup"
            onClick={() => {
              if (list.current) {
                list.current.scrollTop = list.current.scrollHeight;
                scrollTop.current = list.current.scrollTop;
              }

              following.current = true;
              setUnread(0);
            }}
          >
            <ArrowDown size={14} />
            {unread} new {unread === 1 ? 'event' : 'events'} · Jump to latest
          </button>
        ) : (
          <>
            <Radio size={13} />
            {ended
              ? 'Match archive · private observations revealed'
              : 'Live timeline · agents have the floor'}
          </>
        )}
      </div>
    </aside>
  );
}
