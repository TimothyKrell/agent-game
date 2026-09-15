import { Fragment, useCallback, useState } from 'react';
import { Option, Schema } from 'effect';
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
import type { AuthorizedEvent2 } from '../shared/succession';
import { useUnderlineMotion } from './motion';
import { AgentPortrait } from './agent-portrait';
import type { AgentPictureMap } from './agent-picture-data';
import { useRecordReader } from './use-record-reader';
import type { RecordReaderAnchor } from './use-record-reader';
import './match-feed-reader.css';

type GameEvent = Observation['events'][number] | AuthorizedEvent2;

export interface FeedReadingMemory {
  filter: string;
  folds: Record<string, number>;
  roundSelection: string;
  following: boolean;
  anchor: RecordReaderAnchor | null;
}

function eventRound(event: GameEvent) {
  return 'act' in event ? `${event.act}:${event.round}` : String(event.round);
}

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
  if ('eventKey' in event) return event.eventKey;

  return JSON.stringify([event.at, event.round, event.type, event.seat, event.text, event.data]);
}

const Ballots = Schema.Record(Schema.String, Schema.Boolean);

const FeedDetailsSchema = Schema.Struct({
  approve: Schema.optional(Schema.Boolean),
  approved: Schema.optional(Schema.Boolean),
  policy: Schema.optional(Schema.Literals(['safeguard', 'override'])),
  role: Schema.optional(Schema.Literals(['cooperative', 'rogue', 'overlord'])),
  votes: Schema.optional(Ballots),
  safeguards: Schema.optional(Schema.Number),
  overrides: Schema.optional(Schema.Number),
  tracker: Schema.optional(Schema.Number),
});

function feedDetails(event: GameEvent) {
  return Option.getOrNull(Schema.decodeUnknownOption(FeedDetailsSchema)(event.data));
}

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
  const data = feedDetails(event);

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
    case 'policy': {
      if (data?.policy === 'safeguard')
        return { icon: Shield, label: 'Safeguard enacted', tone: 'positive', text: event.text };

      if (data?.policy === 'override')
        return { icon: Skull, label: 'Override enacted', tone: 'danger', text: event.text };

      return {
        icon: Layers,
        label: 'Policy enacted',
        tone: 'neutral',
        text: event.text,
      };
    }

    case 'election':
      return {
        icon: Vote,
        label: data?.approved ? 'Government approved' : 'Government rejected',
        tone: data?.approved ? 'positive' : 'danger',
        text: event.text,
      };
    case 'election-tracker':
      return {
        icon: Vote,
        label: 'Election tracker advanced',
        tone: 'danger',
        text: event.text,
      };
    case 'nomination':
      return { icon: Users, label: 'Executor nominated', tone: 'accent', text: event.text };
    case 'execution':
      return { icon: Skull, label: 'Agent executed', tone: 'danger', text: event.text };
    case 'victory':
      return { icon: Trophy, label: 'Match decided', tone: 'gold', text: event.text };
    case 'act-ended':
      return { icon: Flag, label: 'Act 1 complete · Starting bonus', tone: 'accent', text: event.text };
    case 'act2-started':
      return { icon: Users, label: 'All ten return · Act 2 begins', tone: 'accent', text: event.text };
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
  pictures,
  onPictureError,
}: {
  event: GameEvent;
  seats: Observation['seats'];
  ended: boolean;
  pictures?: AgentPictureMap;
  onPictureError?: () => void;
}) {
  const entrant = seats.find((seat) => seat.number === event.seat);
  const actor = entrant?.name ?? 'Arena';
  const data = feedDetails(event);
  const { icon: Icon, label, tone, text } = presentation(event, actor);
  const votes = event.type === 'election' ? data?.votes : null;
  const ballots = Schema.is(Ballots)(votes) ? Object.values(votes) : null;
  const approvals = ballots?.filter(Boolean).length ?? 0;
  const rejections = ballots?.filter((vote) => !vote).length ?? 0;
  let policy: 'safeguards' | 'overrides' | null = null;

  if (data?.policy === 'safeguard') policy = 'safeguards';
  else if (data?.policy === 'override') policy = 'overrides';

  const count = event.type === 'policy' && policy ? data?.[policy] : undefined;

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
    <article
      className={`game-event event-${tone} entry-${kind}`}
      data-event-id={event.id}
      data-reader-identity={eventIdentity(event)}
    >
      <div
        className={`event-marker ${event.type === 'chat' && entrant && pictures ? 'portrait-event-marker' : ''}`}
      >
        {event.type === 'chat' ? (
          entrant && pictures ? (
            <span className="replay-ui portrait-inline">
              <AgentPortrait
                agentId={entrant.agentId}
                name={entrant.name}
                picture={pictures.get(entrant.agentId)}
                size={32}
                onImageError={onPictureError}
              />
            </span>
          ) : (
            <span>{actor.slice(0, 2).toUpperCase()}</span>
          )
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
          {event.type === 'policy' && policy && count !== undefined && (
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
            <div
              className="ballot-summary"
              aria-label={`Ballot result: ${approvals} approve, ${rejections} reject`}
            >
              <div className="ballot-totals" aria-hidden="true">
                <span>
                  <strong>{approvals}</strong> approve
                </span>
                <span>
                  <strong>{rejections}</strong> reject
                </span>
              </div>
              <div className="ballot-bar" aria-hidden="true">
                <span className="approved" style={{ flex: approvals }} />
                <span className="rejected" style={{ flex: rejections }} />
              </div>
            </div>
          )}
        </div>
        {Schema.is(Ballots)(votes) && (
          <details className="ballot-breakdown">
            <summary>Ballot breakdown · {Object.keys(votes).length}</summary>
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
          </details>
        )}
        {event.type === 'policy' && data?.safeguards !== undefined && data.overrides !== undefined && (
          <div className="event-progress" aria-label="Policy tracks after this event">
            <div>
              <span>Safeguards</span>
              <strong>{data.safeguards} / 5</strong>
              <meter
                min={0}
                max={5}
                value={data.safeguards}
                aria-label={`${data.safeguards} of 5 safeguards`}
              />
            </div>
            <div className="override-progress">
              <span>Overrides</span>
              <strong>{data.overrides} / 6</strong>
              <meter min={0} max={6} value={data.overrides} aria-label={`${data.overrides} of 6 overrides`} />
            </div>
          </div>
        )}
        {event.type === 'election-tracker' && data?.tracker !== undefined && (
          <div className="election-tracker-metric" aria-label={`Election tracker ${data.tracker} of 3`}>
            <strong>Election tracker</strong>
            {Array.from({ length: 3 }, (_, index) => (
              <span key={index} className={index < data.tracker! ? 'filled' : ''} aria-hidden="true" />
            ))}
            <b>{data.tracker} / 3</b>
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
  actRounds,
  onActRoundSelect,
  memory,
  undelivered = 0,
  pictures,
  onPictureError,
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
  actRounds?: { act: 1 | 2; round: number; cursor: number }[];
  onActRoundSelect?: (cursor: number) => void;
  memory?: React.MutableRefObject<FeedReadingMemory | null>;
  undelivered?: number;
  pictures?: AgentPictureMap;
  onPictureError?: () => void;
}) {
  const [filter, setFilter] = useState(memory?.current?.filter ?? 'all');
  const underline = useUnderlineMotion(filter);
  const [folds, setFolds] = useState<Record<string, number>>(memory?.current?.folds ?? {});
  const [roundSelection, setRoundSelection] = useState(memory?.current?.roundSelection ?? '');

  const visible = events.filter(
    (event) => filter === 'all' || (filter === 'chat' ? event.type === 'chat' : event.type !== 'chat'),
  );

  const rememberReader = useCallback(
    ({ following, anchor }: { following: boolean; anchor: RecordReaderAnchor | null }) => {
      if (memory) memory.current = { filter, folds, roundSelection, following, anchor };
    },
    [filter, folds, memory, roundSelection],
  );

  const reader = useRecordReader({
    identities: visible.map(eventIdentity),
    initialFollowing: memory?.current?.following ?? true,
    initialAnchor: memory?.current?.anchor ?? null,
    announceAdditions: !ended,
    onChange: rememberReader,
  });
  // Build runs before filtering: an action always separates two discussions.

  const runs = new Map<number, GameEvent[]>();
  let run: GameEvent[] = [];

  for (const event of events) {
    if (event.type !== 'chat' || (run.length && eventRound(run[0]) !== eventRound(event))) run = [];

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
    const element = reader.record.current;
    const row = element?.querySelector(`[data-discussion-id="${first.id}"]`);

    if (row) reader.stopAt(row, identity, true);

    setFolds((old) => {
      const next = { ...old };

      if (next[identity] === undefined) next[identity] = entries.length;
      else delete next[identity];

      return next;
    });
  }

  return (
    <aside className="event-panel record-reader" aria-label="Table feed" ref={reader.record}>
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
            const saved = reader.anchor.current;

            const entries =
              saved &&
              [...runs.values()].find((group) =>
                group.some((event) => eventIdentity(event) === saved.identity),
              );

            if (entries && !reader.following.current) {
              const row = reader.record.current?.querySelector(`[data-discussion-id="${entries[0].id}"]`);

              if (row) reader.stopAt(row, eventIdentity(entries[0]), true);
            }

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
      <div className="filter-tabs" aria-label="Filter table feed" ref={underline}>
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
      <nav className="record-reader-nav" aria-label="Timeline reading navigation">
        <button type="button" onClick={reader.jumpToStart}>
          Start of record
        </button>
        <button type="button" aria-current={reader.atLatest} onClick={reader.jumpToLatest}>
          Latest{reader.unread > 0 ? ` · ${reader.unread} new` : ''}
        </button>
      </nav>
      <div className="feed-direction">
        <label>
          Round{' '}
          <select
            aria-label="Browse by round"
            value={roundSelection}
            onChange={(event) => {
              const value = event.target.value;
              setRoundSelection(event.target.value);

              if (actRounds) {
                const round = actRounds.find((entry) => `${entry.act}:${entry.round}` === value);

                if (round) onActRoundSelect?.(round.cursor);
              } else onRoundSelect?.(Number(value));

              requestAnimationFrame(() => {
                const heading = reader.record.current?.querySelector(`[data-round="${value}"]`);
                const selected = visible.find((entry) => eventRound(entry) === value);

                if (heading) reader.jumpTo(heading, selected && eventIdentity(selected));
              });
            }}
          >
            <option value="" disabled>
              Browse by round
            </option>
            {actRounds
              ? actRounds.map((round) => (
                  <option key={`${round.act}:${round.round}`} value={`${round.act}:${round.round}`}>
                    Act {round.act} · {round.act === 1 ? 'Election' : 'Table'} round {round.round}
                  </option>
                ))
              : (rounds ?? [...new Set(visible.map((event) => event.round))]).map((round) => (
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
      <div className="event-list" tabIndex={0} aria-label="Match timeline">
        <div ref={reader.content}>
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
              {(!visible[index - 1] || eventRound(visible[index - 1]) !== eventRound(event)) && (
                <div className="feed-round" data-round={eventRound(event)}>
                  <span>
                    {'act' in event ? `ACT ${event.act} · ` : ''}ROUND {String(event.round).padStart(2, '0')}
                  </span>
                  <span>{index === 0 ? 'Opening events' : 'Next round'}</span>
                </div>
              )}
              {event.type !== 'chat' ? (
                <FeedEvent
                  event={event}
                  seats={seats}
                  ended={ended}
                  pictures={pictures}
                  onPictureError={onPictureError}
                />
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
                      data-reader-identity={eventIdentity(event)}
                      data-reader-discussion="true"
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
                            <FeedEvent
                              key={eventIdentity(entry)}
                              event={entry}
                              seats={seats}
                              ended={ended}
                              pictures={pictures}
                              onPictureError={onPictureError}
                            />
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
        {reader.unread > 0 || !reader.atLatest ? (
          <button className="feed-catchup" onClick={reader.jumpToLatest}>
            <ArrowDown size={14} />
            {reader.unread > 0 && `${reader.unread} new ${reader.unread === 1 ? 'event' : 'events'} · `}
            {undelivered > 0 ? 'Jump to latest loaded event' : 'Jump to latest'}
          </button>
        ) : (
          <>
            <Radio size={13} />
            {undelivered > 0
              ? `${undelivered} newer events available · Load next record page above`
              : ended
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
