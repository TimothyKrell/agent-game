# TIM-19–22 / TIM-31 · Production Dossier presentation

## Integration interface (first component checkpoint)

`src/client/succession-dossier.tsx` exports `SuccessionDossier` and its props. Supply a canonical bounded `StoryModel`, authoritative `status` (`active | finished | interrupted`) and current `act`. Optional `archiveAvailable` exposes a local disclosure for **already authorized** archive data. Optional `pictures` is a stable-original-entrant-ID `ReadonlyMap<string, AgentPicture>`; no row performs a metadata request.

`renderChapter({ act, archive, renderRow })` is the TIM-23 integration slot. The reader owns act filtering, bounded retrieval, ordered list wrappers, continuous boundaries and reading anchors. `renderRow(StoryRow)` returns an **article**, not an `li`. The default local composition only iterates the bounded model's rows; it is useful for development fixtures. The production match route still needs TIM-23 integration.

`DossierRow` in `dossier-row.tsx` accepts `{ row, entrants, archive, returns? }`. `entrants` contains immutable identity values only, never final resource/life/controller state. `returns` optionally supplies independently recorded faction bonus allocation to the Act I result. `dossierRowId(row)` is stable across epoch renumbering. The wrapper also emits event key, authorized source cursor and source act data attributes.

Other shared exports:

- `dossier-rules.tsx`: `DossierRule`, `DossierRuleIcon`, `DossierText`; exhaustive production 36-rule icon map and lossless `storyText` segmentation.
- `dossier-identity.tsx`: `DossierPictureProvider`, `DossierPortrait`, `DossierIdentity`; optional picture/missing/broken fallbacks and shared Base UI Dialog. Controller authority never supplies a picture ID.
- `dossier-cards.tsx`: `DossierCard`, `DossierSeatCards`, `DossierResources`, `dossierVisible`; independent nested hand/role visibility and card purpose.
- `dossier-summary.tsx`: `DossierAward`, `DossierReturn`, `DossierOutcome`, `DossierCap`; faction advantage versus mechanical champion versus original entrant credit.
- `dossier-facts.ts`: direct typed mechanical wording. Source dialogue is always rendered verbatim instead.
- `dossier.css`: manifest-imported `components` layer, scoped semantic tokens. No dependencies/configuration changed.

The completed default is Act I closed / Act II open. An active/interrupted record defaults to its current act; explicit user chapter choices survive updates. Chapter interaction uses the shared controlled Base UI Collapsible. Rule help and portrait overlays use the existing scoped portals.

## Baseline preserved

Before guide adoption, the unchanged original 138 browser assertions passed on isolated port 6291. Captures and outputs are under `TIM-19-22-components/before/`; prior design/foundation evidence is untouched. `.tim11/verify-guide.mjs` now permits environment overrides for origin and output directory, retaining the original assertions and defaults.

This checkpoint is an interface handoff, not production-route or bounded-history integration acceptance. Browser checks of new components and typed guide adoption follow in subsequent commits.
