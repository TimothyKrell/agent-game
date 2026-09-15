import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { StoryModel, StoryRow } from './succession-story-types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { RuleHelpProvider } from './ui/rule-help';
import { DossierPictureProvider, dossierName, dossierValue } from './dossier-identity';
import type { DossierPictures } from './dossier-identity';
import { DossierRow } from './dossier-row';
import { dossierVisible } from './dossier-cards';
import { DossierRuleFocusProvider } from './dossier-rules';
import { DossierOutcome, dossierOutcomeTitle } from './dossier-summary';
import type { DossierStatus } from './dossier-summary';

export interface DossierChapterSlot {
  act: 1 | 2;
  archive: boolean;
  /** Returns an article, not an li. The bounded reader owns the ordered list and stable anchors. */
  renderRow: (row: StoryRow) => ReactNode;
}

export interface SuccessionDossierProps {
  model: StoryModel;
  status: DossierStatus;
  act: 1 | 2;
  pictures?: DossierPictures;
  onImageError?: () => void;
  /** Only shows the disclosure for already-authorized archive data. This never changes authority. */
  archiveAvailable?: boolean;
  /** Route-owned disclosure also enables its mounted chapter readers. */
  chapters?: DossierChapterState;
  /** Authoritative live phase/decision UI, never derived from a historical reader window. */
  currentState?: ReactNode;
  /** TIM-23 owns retrieval, source-act filtering, bounded DOM and continuous loading. */
  renderChapter?: (chapter: DossierChapterSlot) => ReactNode;
}

const noPictures: DossierPictures = new Map();

export interface DossierChapterState {
  open: Readonly<Record<1 | 2, boolean>>;
  setOpen: (act: 1 | 2, open: boolean) => void;
}

/** Unset choices follow the current act; explicit reader choices survive current-state updates. */
export function useDossierChapters(status: DossierStatus, act: 1 | 2): DossierChapterState {
  const [choices, setChoices] = useState<Partial<Record<1 | 2, boolean>>>({});
  const current = status === 'finished' ? 2 : act;

  return {
    open: { 1: choices[1] ?? current === 1, 2: choices[2] ?? current === 2 },
    setOpen: (chapter, open) => setChoices((previous) => ({ ...previous, [chapter]: open })),
  };
}

function DossierContent({
  model,
  status,
  act,
  archiveAvailable = false,
  chapters: controlledChapters,
  currentState,
  renderChapter,
}: SuccessionDossierProps) {
  const localChapters = useDossierChapters(status, act);
  const chapters = controlledChapters ?? localChapters;
  const [archive, setArchive] = useState(false);
  const act1Heading = useRef<HTMLButtonElement>(null);
  const act2Heading = useRef<HTMLButtonElement>(null);
  const headings = { 1: act1Heading, 2: act2Heading };
  const showArchive = archiveAvailable && archive;
  const entrants = new Map(model.end.map((seat) => [seat.seat, seat.entrant]));
  const faction = dossierValue(model.chapters.act1);
  const tracks = dossierValue(model.chapters.finalTracks);
  const returns = dossierValue(model.chapters.returns);

  const recipients = returns?.flatMap((seat) =>
    seat.bonus === 1 ? [dossierName(seat.entrant, seat.seat)] : [],
  );

  const renderRow = (row: StoryRow) =>
    row.fact.kind === 'audit' || !dossierVisible(row.visibility, showArchive) ? null : (
      <DossierRow key={row.key} row={row} entrants={entrants} archive={showArchive} returns={returns} />
    );

  return (
    <div className="dossier replay-ui">
      <DossierOutcome chapters={model.chapters} status={status} act={act} entrants={entrants} />
      {currentState}
      <div className="dossier-reading-options">
        {archiveAvailable && (
          <label>
            <input
              type="checkbox"
              checked={showArchive}
              onChange={(event) => setArchive(event.target.checked)}
            />
            <span>
              <strong>Show private archive</strong>
              <small>Secret during play</small>
            </span>
          </label>
        )}
        <span>Hover or tap a highlighted rule term</span>
      </div>
      {([1, 2] as const).map((chapter) => {
        const open = chapters.open[chapter];

        const title =
          chapter === 1
            ? faction
              ? `${faction.team === 'cooperative' ? 'Cooperative' : 'Rogue'} faction wins Act I`
              : act === 1 && status === 'active'
                ? 'Faction contest in progress'
                : 'Act I result unavailable'
            : dossierOutcomeTitle(model.chapters, status);

        const summary =
          chapter === 1
            ? [
                tracks ? `${tracks.overrides} Overrides · ${tracks.safeguards} Safeguards` : faction?.reason,
                recipients?.length ? `+1 Act II coin: ${recipients.join(', ')}.` : undefined,
              ]
                .filter(Boolean)
                .join(' · ')
            : returns
              ? `All ${returns.length === 10 ? 'ten' : returns.length} return · 2 fresh influence each · Individual victory.`
              : act === 1
                ? 'After Act I · Individual victory'
                : 'Individual victory';

        return (
          <Collapsible key={chapter} open={open} onOpenChange={(next) => chapters.setOpen(chapter, next)}>
            <DossierRuleFocusProvider fallbackFocus={headings[chapter]}>
              <section className="dossier-chapter" aria-label={`Act ${chapter === 1 ? 'I' : 'II'}`}>
                <h2>
                  <CollapsibleTrigger className="dossier-chapter-trigger" ref={headings[chapter]}>
                    <span className="dossier-act-numeral">{chapter === 1 ? 'I' : 'II'}</span>
                    <span className="dossier-chapter-copy">
                      <small>ACT {chapter === 1 ? 'I · SECRET OVERLORD' : 'II · SUCCESSION'}</small>
                      <strong>{title}</strong>
                      <span>{summary}</span>
                    </span>
                    <ChevronDown aria-hidden="true" />
                  </CollapsibleTrigger>
                </h2>
                <CollapsibleContent>
                  {open &&
                    (renderChapter ? (
                      renderChapter({ act: chapter, archive: showArchive, renderRow })
                    ) : (
                      <ol className="dossier-record">
                        {model.rows.flatMap((row) => {
                          const content = row.position.act === chapter ? renderRow(row) : null;

                          return content === null ? [] : [<li key={row.key}>{content}</li>];
                        })}
                      </ol>
                    ))}
                </CollapsibleContent>
              </section>
            </DossierRuleFocusProvider>
          </Collapsible>
        );
      })}
    </div>
  );
}

/** Pure presentation composition; model is bounded by buildSuccessionStory, never a full archive import. */
export function SuccessionDossier(props: SuccessionDossierProps) {
  return (
    <DossierPictureProvider pictures={props.pictures ?? noPictures} onImageError={props.onImageError}>
      <RuleHelpProvider>
        <DossierContent key={props.model.scope.matchId} {...props} />
      </RuleHelpProvider>
    </DossierPictureProvider>
  );
}
