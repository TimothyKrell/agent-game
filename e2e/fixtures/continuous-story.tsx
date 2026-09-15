import { useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { onlineManager, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Schema } from 'effect';
import { Observation2Schema } from '../../src/shared/succession';
import type { Observation2 } from '../../src/shared/succession';
import { useSuccessionStory } from '../../src/client/use-succession-story';
import { SuccessionTimeline } from '../../src/client/succession-timeline';
import { useSuccessionMatch } from '../../src/client/use-succession-match';

const client = new QueryClient();

if (new URLSearchParams(location.search).has('offline')) onlineManager.setOnline(false);

function Reading({ current, enabled, name }: { current: Observation2; enabled: boolean; name: string }) {
  const reader = useSuccessionStory(current, {
    initial: 'start',
    enabled,
    onReset: () => {
      document.body.dataset.reset = 'true';
    },
  });

  return (
    <section aria-label={name}>
      <output aria-label={`${name} metrics`}>
        {JSON.stringify({
          after: reader.after,
          delivered: reader.delivered,
          head: reader.head,
          rows: reader.rows.length,
          version: reader.version,
          status: reader.status,
          following: reader.following,
        })}
      </output>
      <button onClick={() => void reader.follow()}>Follow {name}</button>
      <button onClick={() => reader.jumpStart().catch(() => {})}>Start {name}</button>
      <button onClick={() => reader.jumpEnd().catch(() => {})}>End {name}</button>
      <button onClick={() => void reader.seek('missing')}>Missing anchor {name}</button>
      <div hidden={!enabled}>
        <SuccessionTimeline
          reader={reader}
          aria-label={`${name} timeline`}
          scrollRoot={new URLSearchParams(location.search).has('document') ? 'document' : 'self'}
          style={
            new URLSearchParams(location.search).has('document')
              ? { border: '1px solid black' }
              : { height: 420, border: '1px solid black' }
          }
          renderRow={(row) =>
            (new URLSearchParams(location.search).has('omit-tail') &&
              row.source.cursor >= 129 &&
              row.source.cursor <= 176) ||
            (new URLSearchParams(location.search).has('omit-head') && row.source.cursor <= 64) ||
            (new URLSearchParams(location.search).has('sparse') &&
              row.source.cursor >= 100 &&
              row.source.cursor <= 700) ? null : (
              <article
                style={{ padding: 8, minHeight: 40, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
              >
                <button aria-label={`Focus ${row.source.cursor}`}>{row.source.cursor}</button> {row.text}
                <small> · {row.fact.kind}</small>
              </article>
            )
          }
        />
      </div>
    </section>
  );
}

function Commands({ initial, enabled }: { initial: Observation2; enabled: boolean }) {
  const match = useSuccessionMatch(initial, { history: false });

  return (
    <>
      <output aria-label="command metrics">
        {JSON.stringify({
          pending: match.pending,
          receipt: match.receipt,
          head: match.view.history.streamHead,
          legacyRows: match.history.events.length,
        })}
      </output>
      <button onClick={() => void match.act({ type: 'income' })}>Declare income</button>
      <Reading current={match.view} enabled={enabled} name="primary" />
    </>
  );
}

function Fixture() {
  const [current, setCurrent] = useState<Observation2 | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [second, setSecond] = useState(false);
  const query = useQueryClient();

  const cache = useSyncExternalStore(
    (notify) => query.getQueryCache().subscribe(notify),
    () => query.getQueryCache().getAll().length,
  );

  const refresh = async (match = 'a') => {
    const response = await fetch(`/fixture-current?match=${match}`);
    setCurrent(Schema.decodeUnknownSync(Observation2Schema)(await response.json()));
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <main>
      <style>
        {
          'body {font: 16px/1.4 system-ui; margin: 8px;} button {font: inherit;} output {display:block; overflow-wrap:anywhere;} section {margin-bottom:20px;}'
        }
      </style>
      <output aria-label="cache entries">{cache}</output>
      <button onClick={() => void refresh()}>Refresh A</button>
      <button onClick={() => void refresh('b')}>Match B</button>
      <button onClick={() => setEnabled(!enabled)}>Toggle chapter</button>
      <button onClick={() => setSecond(!second)}>Toggle second reader</button>
      <button onClick={() => onlineManager.setOnline(false)}>Go offline</button>
      <button onClick={() => onlineManager.setOnline(true)}>Go online</button>
      {current && new URLSearchParams(location.search).has('commands') ? (
        <Commands initial={current} enabled={enabled} />
      ) : (
        current && (
          <>
            <Reading current={current} enabled={enabled} name="primary" />
            {second && <Reading current={current} enabled name="secondary" />}
          </>
        )
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <Fixture />
  </QueryClientProvider>,
);
