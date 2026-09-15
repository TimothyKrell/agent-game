# TIM-19–22 / TIM-31 · Production Dossier presentation

## Delivered code and integration

- **`f9bc6f2`**: canonical production components and chapter slot; preserved approved-guide baseline.
- **`db34430`**: all twenty retained scenario groups adopted as production-component consumers, exact source and independent engine fixtures, browser evidence.
- **`e292a03`**: actual `/matches/:id` route assembly. Existing `/matches/:id/history` resolves to the same continuous Dossier.
- **`49935cc`**: independently cherry-pickable `AgentPortrait` extraction for TIM-29. See [exact portrait contract](TIM-29-portrait-interface.md).
- **`e2d98ca`**: additive fixed-size and image-failure callback props for TIM-29's shared roster recovery.

This lane merged isolated TIM-23 **`bba70f8`** (including TIM-18 **`4cba978`**) and TIM-11 **`ee2220f`** (including **`d1b2a9b`**). TIM-29's isolated lookup commit **`ee945f5`** was cherry-picked as **`6419fc8`**. The final component/browser runs use normal local primitive source. Parent retains ownership of pending TIM-23 review corrections and final integrated acceptance.

### Actual match route

`src/client/succession-match.tsx` now composes:

```tsx
const match = useSuccessionMatch(initial, { history: false });
const chapters = useDossierChapters(match.view.status, match.view.act);
// Both hooks remain mounted outside the conditional chapter panels.
const actOne = useSuccessionStory(match.view, {
  act: 1,
  enabled: chapters.open[1],
  initial: liveAct === 1 ? 'latest' : 'start',
  onReset: match.refresh,
});
// Act II has the corresponding independent hook.

<SuccessionDossier
  model={summary}
  status={match.view.status}
  act={match.view.act}
  chapters={chapters}
  pictures={pictures.pictures}
  onImageError={pictures.revalidateUnavailable}
  archiveAvailable={match.view.status !== 'active'}
  currentState={/* existing authoritative live phase/decision composition */}
  renderChapter={({ act, renderRow }) => (
    <SuccessionTimeline
      reader={act === 1 ? actOne : actTwo}
      role="region"
      aria-label={`Act ${act === 1 ? 'I' : 'II'} record`}
      className="dossier-timeline"
      renderRow={renderRow}
    />
  )}
/>;
```

`liveAct` is fixed at route mount so a status update cannot reconstruct the readers or discard their anchors. The summary is a zero-event model at the authoritative current cursor. It supplies chapter/outcome and immutable original entrant identities; historical row life, resources, controllers and cards come exclusively from the reader's exact authorized checkpoint/window. Current/final resources are never used as earlier row baselines.

The existing `SuccessionPhase`, `SuccessionControls`, current connection/error/receipt handling and original command hook remain authoritative. Current public seats/resources are available in a collapsed disclosure. There is one chronological reading surface, with no playback, scrubbing, tabs, round selector, permanent seat sidebar or manual page-by-page history controls. The tie commitment/reveal remains available.

The route uses `useAgentPictures(view.seats.map(seat => ({ id: seat.agentId })))` from TIM-29 for one optional fixed original-ID roster batch, passing its map and shared `revalidateUnavailable` callback to the Dossier. Every portrait reports image failure through that same callback; the hook permits one additional whole-roster recovery read and honors newer removal revisions. React's development StrictMode may replay a mount request; requests do not scale with rows/history windows. The normal production route check requires one request; a separate failed-image/removal test exercises the one extra recovery read.

## Presentation API

`src/client/succession-dossier.tsx` exports `SuccessionDossier`, `SuccessionDossierProps`, `DossierChapterSlot`, `DossierChapterState` and `useDossierChapters(status, act)`.

- Required props: bounded canonical `model: StoryModel`, authoritative `status: 'active' | 'finished' | 'interrupted'`, current `act: 1 | 2`.
- Optional `pictures: ReadonlyMap<string, AgentPicture>` is keyed by stable **original entrant** ID, never the replacement controller.
- Optional `onImageError` supplies the one caller-owned shared roster recovery callback. It is forwarded unchanged to each `AgentPortrait`.
- `archiveAvailable` exposes only a display preference for already-authorized archive data. It neither fetches nor authorizes secrets. Live entitled private facts remain readable; archive data is gated independently at row and nested hand/role values.
- Optional `chapters` allows the route to share disclosure state with reader enablement. Without it, the composition owns the same defaults locally.
- `currentState` is the authoritative live-controls slot below the compact overall summary.
- `renderChapter({ act, archive, renderRow })` delegates act filtering, chronological wrappers, loading/error/retry, finite windows and scroll anchors to TIM-23. `renderRow(StoryRow)` returns an **article or null**, never an `li`. Audit and undisplayed rows return actual null to avoid empty anchor wrappers. The default local fixture renderer uses an ordered list over the supplied bounded model.

Completed records default to Act I closed / Act II open. Active/interrupted records default to their current act; explicit chapter choices survive current/terminal updates. Closing a panel removes its row UI but keeps the route's reader hook mounted with `enabled: false`.

Each chapter has a stable heading-button ref, threaded through every nested rule term by `DossierRuleFocusProvider`. Shared `RuleHelpProvider` stays outside both chapters. The gallery uses its surviving archive checkbox for removable archive rows. Consumer code contains no duplicate popup cleanup listener, focus trap or dismissal lifecycle.

### Shared modules

| Module                                      | Exports / responsibility                                                                                                                                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-portrait.tsx` / `agent-portrait.css` | `AgentPortrait`, `AgentPortraitProps`: lookup-free shared graphics, optional/missing/broken fallback, accessible Base UI Dialog. Used by the Dossier adapter and available to TIM-29.                                                         |
| `dossier-identity.tsx`                      | Picture-map provider, thin `DossierPortrait` adapter, `DossierIdentity`, typed value/name helpers.                                                                                                                                            |
| `dossier-row.tsx`                           | `DossierRow({ row, entrants, archive, returns? })`, stable `dossierRowId(row)`. `entrants` is immutable identity only; `returns` is independent recorded starting-bonus allocation. Emits event key, authorized source cursor and source act. |
| `dossier-rules.tsx`                         | Exhaustive production 36-rule icon map, `DossierRule`, `DossierRuleIcon`, lossless `DossierText`, chapter focus-ref context. Source speech is never normalized or name-substituted.                                                           |
| `dossier-cards.tsx`                         | Card purpose (known/proved/lost/hidden), nested visibility, exact historical resource changes and honest unknowns.                                                                                                                            |
| `dossier-summary.tsx`                       | Faction advantage/actual bonus recipients/ten-agent return versus mechanical champion/original entrant credit/house controller, cap criteria.                                                                                                 |
| `dossier-facts.ts`                          | Typed mechanical wording; verbatim source speech remains separate.                                                                                                                                                                            |
| `dossier.css`                               | Approved scoped presentation, semantic tokens, manifest-imported `components` layer.                                                                                                                                                          |

## Retained guide adoption

`?variant=C&sample=components` mounts the actual production row/components for all **20 retained scenario groups** and all **36 terms/icons**. Twelve captured excerpts preserve their original source ranges. Eight independent illustrative groups execute the canonical engine from explicitly seeded arrangements. Additional proof/replacement coverage uses exact engine checkpoints. Every independent alternative is labeled.

The original `sample=examples` comparison and `sample=match` archive remain usable, preserving original names, art, scenario prose, **974 public entries, 416 exact quotations and nine historical elimination counts**. Their original **138 browser assertions** passed before adoption and again afterward, with separate evidence in `before/` and `guide-regression/`.

`tests/fixtures/dossier-recorded.ts` is supplemental development/test source reconstruction, not an engine or production checkpoint provider. It walks public facts forward instead of projecting final resources/life backward. Missing historical hands stay unavailable. Primary temporal/privacy tests use canonical engine emissions/checkpoints from `tests/fixtures/dossier-engine.ts` and the inherited model fixtures.

## Verification and open integration findings

- **53 tests pass**: 26 canonical story tests, nine continuous-reader tests, four substantive presentation tests and 14 shared picture-data tests. Coverage includes all twenty groups, paid cancellation, challenger versus turn owner, nested archive privacy, proof/replacement versus permanent loss, all nine captured elimination rosters, executions/ten-agent return, double loss, all cap criteria, forfeit credit, stable-ID batching, metadata revisions and recovery ownership.
- **212 component browser assertions pass** at 1440, 390 and 320 CSS pixels. Coverage includes all 36 keyboard rules and exact focus return, delayed hover-to-pin, touch, portal tokens, chapter preferences, controlled row eviction/fallback focus, archive privacy, exact source dialogue/acts, long identities, reduced motion, current stable-ID pictures, lazy loading, missing/broken fallbacks and enlargement. See `after/browser-checks.json` and responsive captures. The Dossier now delegates these same picture cases to `AgentPortrait`.
- **Typecheck, lint, scoped formatting and app build pass.** No new dependencies/package/lock changes. Application configuration changes in ancestry are the consumed TIM-11 correction, not a new lane-specific config edit.
- **Production graph/exclusion checks pass:** the actual app bundle contains both the Dossier and bounded reader. Normal app assets and an independent component-entry bundle exclude prototype/scenario/raw-capture markers. Direct production requests cannot mount the development gallery/hidden fixture. See `production.json`.
- **54 development / 57 production actual-route assertions pass, with three retained focus failures in each build.** Results are in `route/checks.json` and `route-production/checks.json`. The actual route reaches the terminal event and reverses through eviction with **128 maximum visible records per reader** and **0.421875px** retained-row drift during the measured forward walk. Checks cover chapter defaults/reopening, exact source-act filtering with both chapters open, archive gating, optional batched pictures, current authority/command IDs, terminal epoch/explicit closure, interrupted semantics and the `/history` alias. The production suite additionally confirms a failed picture triggers exactly one extra whole-roster read, applies a newer removal revision and retains an accessible fallback. The test-only intercepted backend uses **1,306 canonical engine archive events**, exact authorized checkpoints, current snapshots and WebSocket/action responses. These are UI composition tests, not a deployed backend or server authorization certification.

### Pending shared-owner acceptance

The integrated chapter-removal test currently fails: with rule help pinned, programmatically closing its chapter removes the rows and closes the dialog, but final focus lands on **body**. This reproduces with normal **`ee2220f`** source in development and the production build, at all three widths. The retained failure JSON verifies the active trigger's supplied `fallbackFocus.current` is the connected Act II heading. Row-eviction restoration and normal trigger-return tests pass. See `route/*-chapter-focus-failure.json` and the corresponding production captures. The route verifier retains this as a failing assertion while continuing independent checks; production browser acceptance is therefore not claimed.

Parent also reports pending TIM-23 **multi-document-reader scroll ownership (P1)**, **act-index race (P2)** and **offline-paused status** corrections. Both chapter hooks remain mounted; this composition does not substitute a one-reader workaround. Final integrated acceptance requires those owner corrections and a complete route-browser rerun. Build/exclusion success alone is not route interaction acceptance.

## Reproduce

```sh
node .dossier/serve.mjs
node .dossier/verify.mjs
node .dossier/route.mjs
TIM6_ORIGIN=http://127.0.0.1:6291 TIM6_CAPTURE_DIR=docs/evidence/TIM-19-22-components/guide-regression node .tim11/verify-guide.mjs
node node_modules/vitest/vitest.mjs run tests/dossier-components.test.ts tests/succession-story.test.ts tests/continuous-succession-history.test.ts tests/agent-picture-data.test.ts
npm run typecheck
npm run lint
npm run build
node .dossier/production.mjs
git diff --check
```

The scripts use only **6291/6292**. The dev server and fixture compiler have separate `/tmp/opencode/dossier-*-cache` directories so a shared `node_modules` symlink cannot collide with another worktree's Vite optimizer. The prior incoming-primitive override remains available for reproducing checkpoint evidence, but final runs use normal merged source. Browser evidence is Chromium/Linux with reduced motion; no cross-browser or screen-reader certification is implied.
