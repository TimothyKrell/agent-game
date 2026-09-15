import { useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { useQueryClient } from '@tanstack/react-query';
import { ClientQueryProvider } from '../../src/client/query-client';
import { useAgentPictures } from '../../src/client/use-agent-pictures';
import type { AgentPictureMap, PictureIdentity } from '../../src/client/agent-picture-data';
import type { AgentPicture } from '../../src/shared/agent-picture';

function CacheMetrics() {
  const client = useQueryClient();

  const entries = useSyncExternalStore(
    (notify) => client.getQueryCache().subscribe(notify),
    () => client.getQueryCache().getAll().length,
  );

  return <output aria-label="Cache entries">{entries}</output>;
}

function Readout({ name, pictures }: { name: string; pictures: AgentPictureMap }) {
  return <output aria-label={name}>{JSON.stringify([...pictures])}</output>;
}

// A hook lifecycle probe, not a portrait substitute: production portrait consumers are verified separately.
function Roster() {
  const provided = location.search.includes('provided');
  const [other, setOther] = useState(false);
  const [renamed, setRenamed] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState('');
  const first = other ? 'other-0' : 'original-0';

  const known: AgentPicture = removed
    ? { state: 'missing', revision: 9 }
    : {
        state: 'present',
        revision: 1,
        version: 'v1',
        url: `/api/agents/${first}/picture/v1`,
        contentType: 'image/png',
        width: 32,
        height: 32,
        bytes: 200,
      };

  const agents: PictureIdentity[] = Array.from({ length: 10 }, (_, index) => ({
    id: `${other ? 'other' : 'original'}-${index}`,
    picture: provided && index === 0 ? known : undefined,
  }));

  const { pictures, revalidateUnavailable, refresh, error, isFetching } = useAgentPictures(agents, {
    lookup: provided ? 'provided' : 'current',
  });

  return (
    <>
      <output aria-label="Display name">{renamed ? 'Renamed competitor' : 'Original competitor'}</output>
      <output aria-label="Controller">{renamed ? 'replacement-controller' : first}</output>
      <output aria-label="Fetching">{String(isFetching)}</output>
      <output aria-label="Lookup error">{error?.message ?? ''}</output>
      <output aria-label="Refresh status">{refreshStatus}</output>
      <Readout name="Seats" pictures={pictures} />
      <Readout name="Mentions" pictures={pictures} />
      <Readout name="Results" pictures={pictures} />
      <button onClick={() => setRenamed(!renamed)}>Rename and take over</button>
      <button onClick={() => setOther(!other)}>Switch roster</button>
      <button onClick={() => setRemoved(true)}>Provide newer removal</button>
      <button
        onClick={() => {
          for (let i = 0; i < 30; i++) revalidateUnavailable();
        }}
      >
        Report unavailable pictures
      </button>
      <button
        onClick={() => {
          void refresh().then(
            () => setRefreshStatus('Loaded'),
            () => setRefreshStatus('Failed'),
          );
        }}
      >
        Refresh metadata
      </button>
    </>
  );
}

function App() {
  const [mounted, setMounted] = useState(true);

  return (
    <>
      <button onClick={() => setMounted(!mounted)}>{mounted ? 'Unmount roster' : 'Mount roster'}</button>
      <CacheMetrics />
      {mounted && <Roster />}
    </>
  );
}

const root = document.getElementById('root');

if (!root) throw new Error('The picture lookup probe needs a root');

createRoot(root).render(
  <ClientQueryProvider>
    <App />
  </ClientQueryProvider>,
);
