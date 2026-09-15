# Production Dossier — parent integration

**Current acceptance:** Dossier implementation is accepted through **787a991** (Standards0 / Spec0), and the clean parent application suite passes **153/153** at **508bbef**. TIM-19,20,21,22 and31 are Done. Earlier “remaining work” sections below are preserved checkpoints; the final acceptance and recovery sections supersede their status.

Sources through **4f7901b** are locally integrated at **13d96bf**, on top of corrected continuous-history code through74592b8 and accepted picture lookup throughdfb44e6. The Dossier branch contained an older cherry-pick of the picture lookup. Add/add conflicts were resolved by retaining the newer accepted data source, tests and correction evidence unchanged.

## Independent verification

- **63 tests passed:** 27 story, 14 reader, four presentation, 14 picture-data and four picture-lifecycle cases. Log: `/tmp/opencode/Dossier-lead-model-tests.log`.
- **212 component browser assertions passed** at1440/390/320px.
- All **138 retained-guide assertions passed**:58 Dossier,27 annotation and53 moment assertions, with59 captures.
- Actual development route: **54 assertions passed, three known focus assertions failed**.
- Actual production route: **57 assertions passed, the same three focus assertions failed**.
- Each reader mounted at most **128 visible records**; the measured retained-row drift in this traversal was **0.421875px** across a1306-event canonical archive. This ordinary traversal does not close the separate TIM-23 variable-height case.
- Production assets include the actual Dossier and bounded reader. Built assets and a separate component import graph exclude captured/prototype/Agentation markers. Direct guide and hidden-fixture routes cannot mount development controls. These boundary checks passed before the production route's retained focus failures made the combined command exit1.
- Typecheck, lint, app build and staged whitespace checks passed.

The parent runner is `/tmp/opencode/verify-dossier-integration.mjs`. Evidence is isolated under `/tmp/opencode/Dossier-lead-integration/`, including adapted scripts, original/adapted source hashes, captures and per-build failure JSON. Adaptations change only dependency import paths, output/cache paths and ports6391/6392. The production verification script itself runs the production route; no second production route run was performed. Original committed evidence was preserved.

The parent visually inspected the completed desktop entry, narrow Act I execution and actual-source speech. Portrait sizes, close-stacked distinct bubbles, icon-bearing terms and full-width victim/actor/remaining-roster treatment are present. The independent Spec reviewer also verified416 exact quotations,974 captured public entries and an ordinary public Act I execution without allegiance disclosure.

## Remaining presentation acceptance work

The implementation owner is correcting:

1. **Pinned rule help on chapter collapse:** the popup closes, but focus lands on body despite a connected chapter-heading fallback. Both builds reproduce this at all three tested widths.
2. **Completed entry / Final move:** terminal visits initialize Act II at its beginning and omit the accepted direct decisive-move entry. Restore bounded source-backed terminal navigation while keeping live-follow behavior scoped to the live act.
3. **P3 duplicate return projection:** consume canonical chapter returns instead of recalculating initial coins/influence in the renderer.
4. **P3 duplicate action vocabulary:** share the typed action-to-rule map and derive labels from the canonical glossary.

TIM-23 separately owns the remaining pre-replacement scroll-ownership correction. TIM-29 owns the remaining non-Dossier portrait consumers. Final acceptance requires corrected actual-route checks and the established application browser suite. A separate test-only lane is updating obsolete playback/tab expectations to the approved reading behavior while preserving their underlying authority/history assertions.

The retained development guide still contains all20 scenarios and36 terms, with the approved baseline comparison available. This local integration is not hosted owner acceptance.

## Composed focus, vocabulary and terminal-entry corrections

Source **54a3abd** fixes closing-trigger focus retargeting; **a59fbbc** consolidates canonical return facts and action vocabulary; **ab8706c** restores bounded terminal-first entry and the source-backed Final move control. Both Standards P3s are closed. RuleHelp's final Spec review reports0 outstanding, independently exercising physical pointer/modal ordering at1440/390/320 and preserving227 checksum-verified probe files.

Parent independently passed **73 tests**, **nine original plus four focused RuleHelp cases**, **212 component assertions**, **138 retained-guide assertions**, and **87 development /90 production actual-route assertions** against the combined picture/summary/CLI integration. Production graph/direct-entry exclusion and typecheck/lint/build also pass. Evidence is isolated under `/tmp/opencode/Dossier-lead-corrections/`; the original failed route evidence remains unchanged.

The final whitespace check flagged literal trailing spaces/blank lines in captured red-run tool output. `.gitattributes` marks only those captured output classes as whitespace-preserved, retaining original evidence bytes. Application source and authored prose remain subject to normal checks.

The terminal-entry Spec reviewer closed the missing-entry finding but found a new **P2 pending navigation lifetime**: a held Final move request can scroll/focus its eventual row after the viewer opens a portrait modal or navigates to Act I. The implementation owner is fencing that deferred action against subsequent user intent and active modality. Exact evidence: `/tmp/opencode/Dossier-terminal-review/pending-results.json`. Passing ordinary navigation assertions does not close that additional interleaving.

**TIM-19, TIM-20, TIM-22 and TIM-31 are locally accepted and Done** through92ce34f. Their action/card/rule/status/guide contracts are verified. **TIM-21 remains In Progress** for the deferred ending-navigation lifetime; its shared worktree and evidence remain active. Established application browser-suite alignment and TIM-24 hosted review are separate acceptance work.

## Ending-intent integration and reader-ownership follow-up

**2df3c5a**, integrated at **6c76193**, passes parent **27 development and27 production navigation-lifetime cases**,73 units and87 development route assertions. The production route passes89/90: maximum traversal drift **1.8125px** exceeds the unchanged1px limit. The original failing run, adapted runner source hashes and all geometry evidence are retained under `/tmp/opencode/Dossier-lead-ending/`. Production graph/direct-route exclusions and all27 held-modal/chapter cases pass independently of that traversal failure.

Standards review found twoP3s: the route calculates a compensating seek from the reader's window-centering policy, and route/helper reading-position measurement duplicates the timeline while interpreting accessibility labels as act identity. Parent approved a narrow reader-owned cancellation/anchor interface and explicit machine-readable act identity. The presentation owner is implementing it and investigating the independent traversal record; no tolerance increase or acceptance-by-repetition is authorized. Original Spec interleaving review remains active.

The Spec reviewer subsequently closed the original deferred-focus P2, including portrait-open/closed-before-release and modal focus containment. It independently reproduced a new **P2 gutter-scroll regression** at1440/390: wheel input targeting a page-wrapper DIV marks reading ownership as `other`, suppressing boundary reads while Act II remains visible. Baselineab8706c loads the earlier window from the same gutter input. This is assigned to the same ownership refactor, with exact probes in `/tmp/opencode/Dossier-ending-correction-review/`. The reviewer's successful development traversal does not close the parent's separate production drift failure.

### Final reader-owned navigation accepted

**4be03e2 /f149d9e**, integrated at **787a991**, close both StandardsP3s and both navigation SpecP2s. `reader.seek(eventKey, signal?)` owns cancellation without compensating HTTP reads, and `SuccessionTimelineHandle.ownsViewport()` reuses timeline geometry. Explicit act data replaces accessibility-label interpretation. Gutter wheel/touch input follows the visible reader while modal/reference input preserves its own focus and scroll.

Parent **79 units,38 established reader/Query cases,33 development/33 production navigation cases and87/90 actual-route assertions all pass**, including production graph/direct-route exclusions. The current production traversal retains128 rows and **0.421875px** maximum drift under the unchanged1px threshold. The prior1.8125px observation is preserved with exact cause unconfirmed. The improved runner establishes a stable native-scroll baseline and records every traversal step; it does not adjust geometry or widen tolerance.

Independent final reviews report **Standards0 /Spec0**. The reviewer independently passed seven reader lifetime probes and the exact1440/390 gutter reproduction; its first production route run passed90/90. Its production runner executed33 distinct scenarios twice after discovering a pinned test copy;66 executions are not counted as66 unique scenarios. **TIM-21 is now locally accepted and Done.** All Dossier presentation/guide implementation issues are accepted; the separate established browser and hosted acceptance gates remain tracked.

Recovery archive: `/home/timothykrell/Code/agent-games-archive/Dossier-2026-09-15/`, preserving2,435 source/evidence and3,861 parent/reviewer entries. All member hashes, unchanged source, bundle and independent source recovery verified. Snapshot SHA-256 `d54bec8adcda08927c802802f506cdc4bffd3cfc50134eb99cf1f05d780a9ffb`; parent/reviewer archive `d4037e63f581727232e0a916df0c6e395f022022026b1685b732f18b37bf8e8e`; bundle `2619e970f242ea8c7875055d88dde6447a237e4440da29f465cb5bded4258d27`.

The completed Dossier worktree and merged branch were retired after a clean audit. The approved TIM-6 reference worktree remains available.

The test-only established browser migration **41cf9a1 /fac8770** is integrated at **dfc9c79 /988580d**. Source reports153 passed/0 failed/0 skipped/0 flaky against actual local Worker/D1/DO, with2559 archived events and128 mounted rows. Independent assertion-preservation review and a clean parent full-suite run are active. The source's initial JSON/HTML baseline reports were overwritten by later collection commands; original console,28 failure traces/screenshots and source archive remain preserved. This exception is documented in `Dossier-browser-regressions.md` and is not presented as complete original report preservation.

### Parent established-suite follow-up

Independent migration review reports **0 correctness findings** after checking both test commits, running the canonical engine fixture, comparing the contour pixels, auditing153 first-attempt passes, and verifying325 retained source/evidence hashes. The historical-resource assertions distinguish6 coins/two cards from the same entrant's final3 coins/no cards; the unchanged24×28 contour crop retains `maxDiffPixels: 0`.

Parent's clean988580d checkout initially passed112/153. Forty cases could not open a page because the isolated HOME lacked Playwright's recorder; the installed `ffmpeg-1011` was subsequently selected explicitly using `PLAYWRIGHT_BROWSERS_PATH`, preserving the isolated HOME and source assertions. The remaining initial failure was the Worker test's asynchronous response-body capture racing navigation, assigned to its test owner without suppressing capture errors.

The forty video-dependent cases then passed39/40. The remaining case matched14 copies of the challenge notice across the current phase and historical timeline. Parent **d1777bd** scopes that existing assertion to the named Current match state region and exact text. All eight width/motion variants subsequently pass, with no retries or skips. This establishes152 distinct passing cases across the parent runs; the Worker response-capture correction remains pending. Original reports, traces and runner copies remain isolated under `/tmp/opencode/Dossier-lead-browser/`, `/tmp/opencode/Dossier-lead-browser-video/` and `/tmp/opencode/Dossier-lead-live-captures/`; no source failure was discarded or baseline report overwritten.

### Complete established suite accepted

Source **f3ed69d**, integrated at **508bbef**, replaces fixed-snapshot capture draining with request-start admission and a live pending map. The test waits for both body consumption and the native terminal event before its finite, terminal-state reload. Only genuine `net::ERR_ABORTED` requests are classified as canceled; capture errors and all privacy, historical-state, response-size and row-bound assertions remain strict.

Independent correctness review reports **0 findings**, with two native streamed-HTTP cases reproduced against the exact final helper and 57 evidence hashes verified. Parent also passed both native cases. The final clean parent build then passed **all 153 established browser tests in 479.7 seconds**, with **zero failures, retries, skips or flakes**, using one Chromium worker and actual local Worker/D1/DO. Report: `/tmp/opencode/Dossier-lead-browser-final/report.json`.

Final Worker evidence includes the completed two-act match, a **4,627-byte historical checkpoint**, **128 maximum mounted rows**, **235 completed history captures bounded to32 events/16,350 bytes**, and canonical anchor preservation. Decoded evidence and source hashes are in `Dossier-lead-browser-final/audited-evidence/`. The recorder-startup, ambiguous-selector and response-capture failures remain in their original evidence directories. This closes the local established-suite gate while preserving hosted owner acceptance as downstream work.

The final browser archive at `/home/timothykrell/Code/agent-games-archive/Dossier-browser-2026-09-15/` preserves **8,573 source/evidence and19,107 parent/reviewer entries**, including both parent verification checkouts and the exact detached selector commit. All member hashes, bundle recovery and integration patch identities verified before retiring the three completed worktrees and source branch. Snapshot SHA-256 `aaa86a90a84f402a1b01965faa94b0806d910a1302a7915adf40fa6dae778088`; parent/reviewer archive `36d8fe5b637a17b7042bd1853f622734ce3c08d544416340190ea2511fa7835b`; bundle `83d42312f5d2da35dfd93f705254872c519e7476bb6fe1644e521d3ffd4d969f`.
