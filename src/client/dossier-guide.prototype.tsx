/** Retained development consumer of real production presentation and typed canonical model fixtures. */
import { useEffect, useRef, useState } from 'react';
import { Struct } from 'effect';
import { DossierRow } from './dossier-row';
import { DossierRule, DossierRuleFocusProvider } from './dossier-rules';
import { RuleHelpProvider } from './ui/rule-help';
import { DossierPictureProvider, dossierValue } from './dossier-identity';
import { DossierOutcome } from './dossier-summary';
import { SuccessionDossier } from './succession-dossier';
import { storyRules } from './succession-story-rules';
import type { StoryModel } from './succession-story-types';
import { capturedStory, dossierRecordedExamples } from '../../tests/fixtures/dossier-recorded';
import { dossierEngineExamples, dossierProof } from '../../tests/fixtures/dossier-engine';
import type { DossierEngineExample } from '../../tests/fixtures/dossier-engine';
import { useLocation } from './navigation';

const noPictures = new Map();

const recorded = dossierRecordedExamples.map((example) => ({
  ...example,
  model: capturedStory(example.start, example.through),
}));

function ExampleModel({ model, archive }: { model: StoryModel; archive: boolean }) {
  const entrants = new Map(model.end.map((seat) => [seat.seat, seat.entrant]));

  const terminal =
    model.chapters.outcome.status !== 'unavailable' || model.chapters.interruption.status !== 'unavailable';

  return (
    <>
      {terminal && model.scope.matchId.startsWith('story-') && (
        <DossierOutcome
          chapters={model.chapters}
          act={2}
          status={model.chapters.outcome.status !== 'unavailable' ? 'finished' : 'interrupted'}
          entrants={entrants}
        />
      )}
      <ol className="dossier-record">
        {model.rows.map((row) => (
          <li key={row.key}>
            <DossierRow
              row={row}
              entrants={entrants}
              archive={archive}
              returns={dossierValue(model.chapters.returns)}
            />
          </li>
        ))}
      </ol>
    </>
  );
}

export default function DossierGuide() {
  const url = new URL(useLocation());
  const [archive, setArchive] = useState(false);
  const archiveToggle = useRef<HTMLInputElement>(null);
  const [examples, setExamples] = useState<DossierEngineExample[]>([]);
  const [proof, setProof] = useState<StoryModel>();
  const [error, setError] = useState('');
  const composition = url.searchParams.get('composition') === 'true';
  const anchor = url.hash.slice(1);

  useEffect(() => {
    let active = true;
    Promise.all([dossierEngineExamples(), dossierProof()])
      .then(([cases, proved]) => {
        if (active) {
          setExamples(cases);
          setProof(proved);
        }
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!anchor) return;

    const frame = requestAnimationFrame(() =>
      document.getElementById(anchor)?.scrollIntoView({ block: 'start', behavior: 'instant' }),
    );

    return () => cancelAnimationFrame(frame);
  }, [anchor, examples]);

  return (
    <div className="page replay-ui dossier" data-dossier-guide="production-components">
      <nav className="dp-preview-nav" aria-label="Development reference">
        <a href="?variant=C&sample=examples">Approved source comparison</a>
        <a href="?variant=C&sample=components">Action & UI examples · shared production components</a>
        <a href="?variant=C&sample=components&composition=true">Chapter composition</a>
      </nav>
      <header className="dp-examples-intro">
        <h1>Action & UI examples</h1>
        <p>
          Development-only · Actual production Dossier components. Twelve captured excerpts and eight
          independent engine-generated scenario groups.
        </p>
        <p>
          Captured excerpts use a source-only public checkpoint adapter, with unknown historical hands left
          unavailable. Independent scenarios use exact canonical engine checkpoints. The approved source
          comparison retains all original dialogue, scenarios and illustrations.
        </p>
      </header>
      {error && <p role="alert">Fixture failed: {error}</p>}
      {composition ? (
        <SuccessionDossier model={recorded[3].model} status="finished" act={2} archiveAvailable />
      ) : (
        <DossierPictureProvider pictures={noPictures}>
          <RuleHelpProvider>
            <DossierRuleFocusProvider fallbackFocus={archiveToggle}>
              <div className="dossier-reading-options">
                <label>
                  <input
                    type="checkbox"
                    ref={archiveToggle}
                    checked={archive}
                    onChange={(event) => setArchive(event.target.checked)}
                  />
                  <span>
                    <strong>Show private archive</strong>
                    <small>Secret during play</small>
                  </span>
                </label>
              </div>
              <nav className="dp-example-index" aria-label="Action and UI examples">
                {[...recorded, ...examples].map((example) => (
                  <a key={example.id} href={`#dossier-example-${example.id}`}>
                    {example.title}
                  </a>
                ))}
              </nav>
              <details id="dossier-rule-index" className="dp-rule-index" open>
                <summary>All 36 rule terms & icons</summary>
                <div>
                  {Struct.keys(storyRules).map((rule) => (
                    <DossierRule key={rule} rule={rule} />
                  ))}
                </div>
              </details>
              {recorded.map((example) => (
                <section
                  key={example.id}
                  id={`dossier-example-${example.id}`}
                  className="dp-example"
                  data-example-group={example.id}
                >
                  <header>
                    <h2>{example.title}</h2>
                    <span>
                      Recorded source · Events {example.start}–{example.through}
                    </span>
                  </header>
                  <ExampleModel model={example.model} archive={archive} />
                </section>
              ))}
              {examples.map((example) => (
                <section
                  key={example.id}
                  id={`dossier-example-${example.id}`}
                  className="dp-example"
                  data-example-group={example.id}
                >
                  <header>
                    <h2>{example.title}</h2>
                    <span>Illustrative · Independent engine-generated scenarios</span>
                  </header>
                  {example.models.map((model, index) => (
                    <section key={index} aria-label={`Independent scenario ${index + 1}`}>
                      <h3>Scenario {index + 1}</h3>
                      <ExampleModel model={model} archive={archive} />
                    </section>
                  ))}
                </section>
              ))}
              {proof && (
                <section id="dossier-proof-engine" className="dp-example">
                  <header>
                    <h2>Exact-checkpoint proof and replacement</h2>
                    <span>Additional engine verification</span>
                  </header>
                  <ExampleModel model={proof} archive={archive} />
                </section>
              )}
              <p role="status">
                {examples.length === 8 ? '20 scenario groups ready' : 'Preparing engine fixtures…'}
              </p>
            </DossierRuleFocusProvider>
          </RuleHelpProvider>
        </DossierPictureProvider>
      )}
    </div>
  );
}
