/** Development-only browser harness: canonical engine models and explicit UI stress controls. */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { dossierLifecycle, dossierProof, dossierUnknown } from '../../tests/fixtures/dossier-engine';
import { SuccessionDossier } from './succession-dossier';
import { dossierValue, DossierPictureProvider, DossierIdentity } from './dossier-identity';
import type { DossierPictures } from './dossier-identity';
import type { StoryModel, StorySeat } from './succession-story-types';
import type { DossierStatus } from './dossier-summary';
import './client.css';
import pictureFixture from '../../tests/fixtures/agent-pictures/fixture.jpg';

const pictures: DossierPictures = new Map([
  [
    'entrant-0',
    {
      state: 'present',
      revision: 1,
      version: 'fixture-present',
      url: pictureFixture,
      contentType: 'image/jpeg',
      width: 8,
      height: 8,
      bytes: 296,
    },
  ],
  [
    'entrant-1',
    {
      state: 'present',
      revision: 1,
      version: 'fixture-broken',
      url: '/dossier-broken.png',
      contentType: 'image/png',
      width: 1,
      height: 1,
      bytes: 68,
    },
  ],
]);

function longIdentities(model: StoryModel) {
  const copy = structuredClone(model);

  const rename = (seat: Pick<StorySeat, 'seat' | 'entrant'>) => {
    if (seat.entrant.status !== 'unavailable')
      seat.entrant.value.name = `Agent ${seat.seat + 1} · LongUnbrokenIdentity${'x'.repeat(110)} · Original entrant`;
  };

  copy.end.forEach(rename);
  copy.rows.forEach((row) =>
    row.affected.forEach((change) => {
      rename(change.before);
      rename(change.after);
    }),
  );
  dossierValue(copy.chapters.returns)?.forEach(rename);
  const outcome = dossierValue(copy.chapters.outcome);

  if (outcome) rename(outcome.winner);

  return copy;
}

function Controls() {
  const [lifecycle, setLifecycle] = useState<Awaited<ReturnType<typeof dossierLifecycle>>>();
  const [proof, setProof] = useState<StoryModel>();
  const [unknown, setUnknown] = useState<StoryModel>();

  const [stage, setStage] = useState<'act1' | 'act2' | 'finished' | 'interrupted' | 'proof' | 'unknown'>(
    'act1',
  );

  const [long, setLong] = useState(false);
  const [evicted, setEvicted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([dossierLifecycle(), dossierProof(), dossierUnknown()])
      .then(([life, claim, missing]) => {
        setLifecycle(life);
        setProof(claim);
        setUnknown(missing);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  useEffect(() => {
    const remove = () => setEvicted(true);
    const restore = () => setEvicted(false);
    window.addEventListener('dossier-remove-rows', remove);
    window.addEventListener('dossier-restore-rows', restore);

    return () => {
      window.removeEventListener('dossier-remove-rows', remove);
      window.removeEventListener('dossier-restore-rows', restore);
    };
  }, []);

  if (error) return <p role="alert">{error}</p>;

  if (!lifecycle || !proof || !unknown) return <p>Preparing fixtures…</p>;
  const model = { ...lifecycle, proof, unknown, interrupted: lifecycle.act2 }[stage];

  const statuses = {
    finished: 'finished',
    interrupted: 'interrupted',
    act1: 'active',
    act2: 'active',
    proof: 'active',
    unknown: 'active',
  } as const satisfies Record<typeof stage, DossierStatus>;

  const status = statuses[stage];

  return (
    <main className="page">
      <nav aria-label="Fixture controls">
        {(['act1', 'act2', 'finished', 'interrupted', 'proof', 'unknown'] as const).map((next) => (
          <button key={next} onClick={() => setStage(next)}>
            {next}
          </button>
        ))}
        <label>
          <input type="checkbox" checked={long} onChange={(event) => setLong(event.target.checked)} />
          Long identities
        </label>
      </nav>
      <SuccessionDossier
        model={long ? longIdentities(model) : model}
        act={stage === 'act1' ? 1 : 2}
        status={status}
        archiveAvailable
        pictures={pictures}
        renderChapter={({ act, renderRow }) => (
          <ol className="dossier-record">
            {!evicted &&
              (long ? longIdentities(model) : model).rows.flatMap((row) =>
                row.position.act === act ? [<li key={row.key}>{renderRow(row)}</li>] : [],
              )}
          </ol>
        )}
      />
      <section className="replay-ui" aria-label="Picture delivery cases">
        <DossierPictureProvider pictures={pictures}>
          {proof.end.flatMap((seat) =>
            ['entrant-0', 'entrant-1', 'entrant-2'].includes(dossierValue(seat.entrant)?.agentId ?? '')
              ? [<DossierIdentity key={seat.seat} seat={seat.seat} entrant={seat.entrant} />]
              : [],
          )}
        </DossierPictureProvider>
      </section>
      <p role="status">Canonical component fixture ready</p>
    </main>
  );
}

if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Controls />);
