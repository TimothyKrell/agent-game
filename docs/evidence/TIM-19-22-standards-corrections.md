# Dossier review · Shared canonical facts and action vocabulary

Baseline: `4f7901b`; the accepted history corrections through `74592b8` were merged separately before extracting vocabulary. The terminal Tax causality change remains intact.

- `succession-story-rules.ts` exports `storyActionRules`, exhaustively typed against `StoryAction['action']` and `StoryRule`. The canonical model and Dossier row consume it; mechanical action labels come from `storyRules[storyActionRules[action]][0]`. The preserved original prototype remains historical evidence.
- `DossierRow` consumes the supplied canonical `model.chapters.returns` for the Act II starting-state display. It no longer calculates bonus coins, influence, role or execution return independently. Missing canonical allocation renders **Recorded starting states unavailable.**
- The route summary supplies a zero-event model at the authoritative cursor. Its return facts come from the authorized observation's immutable `act1Result` (recorded roles, bonuses and returned seats), via canonical `snapshotChapters` / `returns`. The only seat field used by that projection is original entrant identity. Current coins, hands, controller and life state are not projected backward into starting states.

Verification: **58 tests pass** (27 story, 14 reader, 13 authorized-loading, four presentation), including terminal Tax, all twenty groups, 416 exact quotes, historical rosters, and a new absence check ensuring the row cannot reconstruct omitted canonical return facts. Typecheck and lint pass. Original source/capture evidence is preserved.

```sh
npm test -- tests/dossier-components.test.ts tests/succession-story.test.ts tests/continuous-succession-history.test.ts tests/succession-history-loading.test.ts
npm run typecheck
npm run lint
```
