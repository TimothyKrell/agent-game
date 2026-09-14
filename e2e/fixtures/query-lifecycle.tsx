import { useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Option, Schema } from 'effect';
import { ObservationSchema } from '../../src/shared/api';
import { Observation2Schema } from '../../src/shared/succession';
import type { Observation2 } from '../../src/shared/succession';
import type { Observation } from '../../src/game/types';
import { useLoad } from '../../src/client/use-load';
import { useSuccessionMatch } from '../../src/client/use-succession-match';
import { useSecretOverlordMatch } from '../../src/client/use-secret-overlord-match';
import { SuccessionReplay } from '../../src/client/succession-replay';
import { matchReadKey, matchReadScope } from '../../src/client/succession-replay-data';
import type { FeedReadingMemory } from '../../src/client/match-feed';

const eventCount = Schema.Struct({ events: Schema.Array(Schema.Struct({ id: Schema.Number })) });

function CacheMetrics() {
  const client = useQueryClient();

  const value = useSyncExternalStore(
    (notify) => client.getQueryCache().subscribe(notify),
    () => {
      const queries = client.getQueryCache().getAll();
      const windows = queries.filter((query) => query.queryKey.includes('replay-slice'));
      let events = 0;

      for (const query of windows) {
        const data = Schema.decodeUnknownOption(eventCount)(query.state.data);

        if (Option.isSome(data)) events += data.value.events.length;
      }

      return JSON.stringify({
        windows: windows.length,
        events,
        entries: queries.length,
        epochs: queries.map((query) => query.queryKey[6]),
      });
    },
  );

  return <output aria-label="Cache metrics">{value}</output>;
}

function Game({ initial }: { initial: Observation2 }) {
  const { view, act, pending, receipt, error, connected, refresh, loadingHistory, loadHistory, history } =
    useSuccessionMatch(initial);

  const client = useQueryClient();

  const memory = useRef<FeedReadingMemory | null>(
    location.search.includes('anchor')
      ? {
          filter: 'all',
          folds: {},
          roundSelection: '',
          following: false,
          anchor: { identity: 'event-17', top: 0 },
        }
      : null,
  );

  const mirrorMemory = useRef<FeedReadingMemory | null>(null);
  const [show, setShow] = useState(!location.search.includes('hold'));
  const [mirror, setMirror] = useState(false);

  const submit = (twice = false) => {
    const action = view.decision?.actions[0]?.action;

    if (!action) return;
    void act(action);

    if (twice) void act(action);
  };

  return (
    <>
      <output aria-label="Current phase">{view.phase.id}</output>
      <output aria-label="Current controller">{view.you?.agentId ?? 'public'}</output>
      <output aria-label="Current epoch">{view.history.visibilityEpoch}</output>
      <output aria-label="Connection">{connected ? 'connected' : 'disconnected'}</output>
      <output aria-label="Command receipt">{receipt}</output>
      <output aria-label="Command error">{error}</output>
      <output aria-label="History cursor">{history.cursor}</output>
      <button
        disabled={loadingHistory}
        onClick={() => {
          void loadHistory();
        }}
      >
        Load history
      </button>
      <button disabled={pending} onClick={() => submit()}>
        Submit decision
      </button>
      <button disabled={pending} onClick={() => submit(true)}>
        Submit twice
      </button>
      <button onClick={() => submit(true)}>Call act directly twice</button>
      <button onClick={refresh}>Recheck current</button>
      <button onClick={() => setShow(!show)}>{show ? 'Unmount replay' : 'Mount replay'}</button>
      <button onClick={() => setMirror(!mirror)}>{mirror ? 'Remove mirror' : 'Mount mirror'}</button>
      <button
        onClick={() => {
          void client.invalidateQueries({ queryKey: matchReadKey(matchReadScope(view)) });
        }}
      >
        Invalidate reads
      </button>
      {show && view.status !== 'active' && (
        <div aria-label="Primary replay">
          <SuccessionReplay view={view} refresh={refresh} memory={memory} />
        </div>
      )}
      {mirror && view.status !== 'active' && (
        <div aria-label="Mirror replay">
          <SuccessionReplay view={view} refresh={refresh} memory={mirrorMemory} />
        </div>
      )}
    </>
  );
}

function ProtocolOne({ initial }: { initial: Observation }) {
  const [renders, rerender] = useState(0);
  // A parent can recreate the same match's decoded prop without replacing the connection.
  const { view, error, refresh } = useSecretOverlordMatch({ ...initial });

  return (
    <>
      <output aria-label="Protocol one events">
        {view?.events.map((event) => event.id).join(',') ?? 'loading'}
      </output>
      <output aria-label="Protocol one error">{error}</output>
      <button onClick={refresh}>Retry protocol one</button>
      <button onClick={() => rerender(renders + 1)}>Rerender protocol one {renders}</button>
    </>
  );
}

function OneLoader() {
  const { data } = useLoad('/api/matches/protocol-one', ObservationSchema);

  return data && <ProtocolOne initial={data} />;
}

function GameLoader() {
  const { data } = useLoad('/api/matches/query-fixture', Observation2Schema);

  return data && <Game initial={data} />;
}

function App() {
  const [mounted, setMounted] = useState(true);

  return (
    <>
      <button onClick={() => setMounted(!mounted)}>{mounted ? 'Unmount game' : 'Mount game'}</button>
      <CacheMetrics />
      {location.search.includes('protocol-one') ? <OneLoader /> : mounted && <GameLoader />}
    </>
  );
}

const root = document.getElementById('root');

if (!root) throw new Error('Missing lifecycle fixture root');

createRoot(root).render(
  <QueryClientProvider client={new QueryClient()}>
    <App />
  </QueryClientProvider>,
);
