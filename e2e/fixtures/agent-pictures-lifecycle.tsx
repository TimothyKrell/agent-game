import { useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { useQueryClient } from '@tanstack/react-query';
import { ClientQueryProvider } from '../../src/client/query-client';
import { useAgentPictures } from '../../src/client/use-agent-pictures';
import type { PictureIdentity } from '../../src/client/agent-picture-data';

function Metrics() {
  const client = useQueryClient();

  const count = useSyncExternalStore(
    (notify) => client.getQueryCache().subscribe(notify),
    () => client.getQueryCache().getAll().length,
  );

  return <output aria-label="Queries">{count}</output>;
}

function Reader({
  label,
  agents,
  provided = false,
}: {
  label: string;
  agents: PictureIdentity[];
  provided?: boolean;
}) {
  const value = useAgentPictures(agents, { lookup: provided ? 'provided' : 'current' });

  return (
    <>
      <output aria-label={label}>{JSON.stringify([...value.pictures])}</output>
      <output aria-label={`${label} fetching`}>{String(value.isFetching)}</output>
      <button
        onClick={() => {
          void value.refresh().catch(() => {});
        }}
      >
        Refresh {label}
      </button>
    </>
  );
}

function Overlap() {
  const [removed, remove] = useState(false);
  const [provided, showProvided] = useState(true);
  const [current, showCurrent] = useState(true);
  const alpha = { id: 'alpha', picture: { state: 'missing' as const, revision: removed ? 9 : 1 } };

  return (
    <>
      <button onClick={() => remove(true)}>Provide removal</button>
      <button onClick={() => showProvided(!provided)}>Toggle provided</button>
      <button onClick={() => showCurrent(!current)}>Toggle current</button>
      {current && <Reader label="Current" agents={[{ id: 'alpha' }, { id: 'beta' }]} />}
      {provided && <Reader label="Provided" agents={[alpha, { id: 'gamma' }]} provided />}
      <Metrics />
      <ClientQueryProvider>
        <Reader
          label="Isolated"
          agents={[{ id: 'alpha', picture: { state: 'missing', revision: 1 } }]}
          provided
        />
      </ClientQueryProvider>
    </>
  );
}

function RefreshSource({ save }: { save: (answer: string) => void }) {
  const [id, change] = useState('a');
  const value = useAgentPictures([{ id }]);
  const captured = useRef(value.refresh);

  const run = (refresh: typeof value.refresh) => {
    void refresh().then(
      (result) =>
        save(
          JSON.stringify({ resolved: true, result }, (_key, entry) =>
            entry instanceof Map ? [...entry] : entry,
          ),
        ),
      (error: Error) => save(JSON.stringify({ resolved: false, name: error.name })),
    );
  };

  return (
    <>
      <output aria-label="Source">{JSON.stringify([...value.pictures])}</output>
      <button
        onClick={() => {
          captured.current = value.refresh;
          run(value.refresh);
        }}
      >
        Start refresh
      </button>
      <button onClick={() => run(captured.current)}>Call captured refresh</button>
      <button onClick={() => change(id === 'a' ? 'b' : 'a')}>Switch source</button>
    </>
  );
}

function Refresh() {
  const [mounted, mount] = useState(true);
  const [answer, save] = useState('');

  return (
    <>
      <output aria-label="Answer">{answer}</output>
      <button onClick={() => mount(!mounted)}>Toggle source</button>
      {mounted && <RefreshSource save={save} />}
      <Reader label="Destination" agents={[{ id: 'b' }]} />
      {location.search.includes('shared') && <Reader label="Shared" agents={[{ id: 'a' }]} />}
      <Metrics />
    </>
  );
}

const root = document.getElementById('root');

if (!root) throw new Error('The lifecycle probe needs a root');

createRoot(root).render(
  <ClientQueryProvider>{location.pathname === '/overlap' ? <Overlap /> : <Refresh />}</ClientQueryProvider>,
);
