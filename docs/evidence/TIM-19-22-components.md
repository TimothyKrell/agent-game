# TIM-19–22 / TIM-31 · Production Dossier presentation

## Route assembly checkpoint

After component checkpoint `db34430`, TIM-23 `bba70f8` (including `4cba978`) was merged into this lane. `succession-match.tsx` now composes the actual route with two mounted `useSuccessionStory` hooks, chapter-owned enablement, and `SuccessionTimeline` under the Dossier panels. Its summary model contains zero history rows at the authoritative current cursor; historical row state comes only from each reader window. One optional stable-original-ID picture batch supplies all portraits. The existing phase/decision composer still receives authoritative current state and the original command hook. `/history` resolves to the same continuous presentation. Route acceptance is in progress below; earlier checkpoint claims are retained for provenance.

## Integration interface (first component checkpoint)

`src/client/succession-dossier.tsx` exports `SuccessionDossier` and its props. Supply a canonical bounded `StoryModel`, authoritative `status` (`active | finished | interrupted`) and current `act`. Optional `archiveAvailable` exposes a local disclosure for **already authorized** archive data. Optional `pictures` is a stable-original-entrant-ID `ReadonlyMap<string, AgentPicture>`; no row performs a metadata request.

`renderChapter({ act, archive, renderRow })` is the TIM-23 integration slot. The reader owns act filtering, bounded retrieval, ordered list wrappers, continuous boundaries and reading anchors. `renderRow(StoryRow)` returns an **article**, not an `li`. The default local composition only iterates the bounded model's rows; it is useful for development fixtures. The production match route still needs TIM-23 integration.

`DossierRow` in `dossier-row.tsx` accepts `{ row, entrants, archive, returns? }`. `entrants` contains immutable identity values only, never final resource/life/controller state. `returns` optionally supplies independently recorded faction bonus allocation to the Act I result. `dossierRowId(row)` is stable across epoch renumbering. The wrapper also emits event key, authorized source cursor and source act data attributes.

Other shared exports:

- `dossier-rules.tsx`: `DossierRule`, `DossierRuleIcon`, `DossierText`, `DossierRuleFocusProvider`; exhaustive production 36-rule icon map and lossless `storyText` segmentation. The focus provider threads a surviving chapter-heading ref through every nested rule term.
- `dossier-identity.tsx`: `DossierPictureProvider`, `DossierPortrait`, `DossierIdentity`; optional picture/missing/broken fallbacks and shared Base UI Dialog. Controller authority never supplies a picture ID.
- `dossier-cards.tsx`: `DossierCard`, `DossierSeatCards`, `DossierResources`, `dossierVisible`; independent nested hand/role visibility and card purpose.
- `dossier-summary.tsx`: `DossierAward`, `DossierReturn`, `DossierOutcome`, `DossierCap`; faction advantage versus mechanical champion versus original entrant credit.
- `dossier-facts.ts`: direct typed mechanical wording. Source dialogue is always rendered verbatim instead.
- `dossier.css`: manifest-imported `components` layer, scoped semantic tokens. No dependencies/configuration changed.

The completed default is Act I closed / Act II open. An active/interrupted record defaults to its current act; explicit user chapter choices survive updates. Chapter interaction uses the shared controlled Base UI Collapsible. Rule help and portrait overlays use the existing scoped portals.

## Baseline preserved

Before guide adoption, the unchanged original 138 browser assertions passed on isolated port 6291. Captures and outputs are under `TIM-19-22-components/before/`; prior design/foundation evidence is untouched. `.tim11/verify-guide.mjs` now permits environment overrides for origin and output directory, retaining the original assertions and defaults.

## Incoming shared interaction dependency

The chapter-ref wiring consumes the additive `RuleHelpTrigger.fallbackFocus` API from **TIM-11 correction `d1b2a9b`**. Each chapter has its own stable heading-button ref; all its row terms inherit that ref through `DossierRuleFocusProvider`. The shared `RuleHelpProvider` stays outside the chapters. The guide uses its surviving archive checkbox for removable archive rows. No consumer cleanup listener, focus trap or modal lifecycle is duplicated.

The first browser runs reproduced the already-diagnosed delayed-hover pinning defect on the older primitive. The parent owns integration of the correction. Pending that merge, `.dossier/serve.mjs` can test the exact incoming first-party source using `DOSSIER_RULE_HELP_SOURCE`: a verification-only Vite load override preserves this worktree's normal module paths and installed dependencies. It changes no shared source or application config. This is explicit incoming-dependency verification, not a claim that the older primitive has been fixed on this branch.

## Retained guide consumer

`?variant=C&sample=components` mounts the actual production row/components for all **20 retained scenario groups** and all **36 production terms/icons**. Twelve excerpts retain their original captured source ranges; eight independent illustrative groups now execute the canonical engine from explicit seeded arrangements. Every independent alternative is labeled. An additional exact-checkpoint proof sequence exercises replacement and nested card privacy.

The original `sample=examples` comparison and `sample=match` archive remain usable. They preserve original names, illustrative art and scenario prose, all 974 public entries / 416 exact quotations, and the prior source capture. Their **138 original assertions** pass again in `TIM-19-22-components/guide-regression/`; only the new navigation link is added to their wrapper.

`tests/fixtures/dossier-recorded.ts` is a **development/test source adapter**, not an engine or production checkpoint provider. It walks recorded public facts forward to seed life/resources and bounded model windows; it does not reuse final life, influence, balances or hands. Captured historical hands without a supplied in-window record stay unavailable. The canonical engine fixtures in `tests/fixtures/dossier-engine.ts` supply the primary exact-baseline temporal/privacy cases. The source adapter's auxiliary observation fields are fixture scaffolding and are not suitable as a production history endpoint.

## Verification

- **28 tests passed:** the existing 24 canonical story tests plus four substantive presentation tests. These exercise all twenty groups, paid cancellation, different acting challenger/turn owner, nested public-row archive hand/role gating, proof versus permanent loss, all nine captured elimination rosters, both execution rosters and ten-agent return, double loss, all three cap criteria and forfeit credit.
- **203 browser assertions passed** at 1440, 390 and 320 CSS pixels with the incoming `d1b2a9b` RuleHelp source. The suite verifies all 36 rules with exact return focus, delayed hover-to-pin, touch, portal tokens, chapter preference retention, controlled row eviction restoring the surviving chapter heading, subsequent reopen/normal trigger focus, nested archive gating, exact speech, all twenty groups, source-act labels, two execution rosters, double loss, unknown baselines, long identities, reduced motion, missing/broken/current stable-ID pictures and enlargement. No application exceptions or per-row metadata requests. Captures and assertions are in `TIM-19-22-components/after/`.
- `npm run typecheck` passes all three TypeScript projects. Repository lint and scoped formatting are checked for the final source set.
- `npm run build` passes. The normal app build and an independent production component entry bundle exclude prototype/scenario/capture markers. Direct production requests for both the shared guide and the hidden browser fixture do not mount development content. See `TIM-19-22-components/production.json` and its direct-route capture. The independent entry bundle is needed because the parent still owns actual route integration.

This remains a presentation and guide handoff, not production-route or bounded-history integration acceptance.

### Reproduce in the isolated worktree

```sh
# Use normal mode after the parent integrates d1b2a9b; the override is only for the incoming dependency.
DOSSIER_RULE_HELP_SOURCE=/tmp/opencode/agent-game-TIM-11/src/client/ui/rule-help.tsx node .dossier/serve.mjs
node .dossier/verify.mjs
TIM6_ORIGIN=http://127.0.0.1:6291 TIM6_CAPTURE_DIR=docs/evidence/TIM-19-22-components/guide-regression node .tim11/verify-guide.mjs
node node_modules/vitest/vitest.mjs run tests/dossier-components.test.ts tests/succession-story.test.ts
npm run typecheck
npm run lint
npm run build
node .dossier/production.mjs
git diff --check
```

The verifier uses only 6291/6292. Browser coverage is Chromium/Linux; it includes reduced-motion rendering, not cross-browser or screen-reader certification. The independent source adapter is supplemental fixture evidence. Production acceptance still requires the parent's actual TIM-23 data/route composition, its authorized history pagination/eviction checks, and normal-source verification after the shared primitive correction is merged.
