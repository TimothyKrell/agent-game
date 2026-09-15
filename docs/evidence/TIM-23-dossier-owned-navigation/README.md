# Reader-owned navigation and Dossier document-input ownership

Baseline: **`2df3c5a`**. Parent authorized the narrow shared-reader/timeline expansion after two Standards P3 ownership findings. Independent Spec then identified gutter scrolling as a new P2. Its original deferred-navigation finding was closed.

Shared interface commit: **`4be03e2`** (`continuous-succession-history.ts`, `succession-timeline.tsx`, focused reader tests). Apply the accompanying Dossier integration/evidence commit after it.

## Reader interface and implementation

```ts
reader.seek(eventKey: string, signal?: AbortSignal): Promise<void>
```

The existing call remains valid. A caller can now supply a request-owned signal:

- Abort retires only that navigation and its reader-generation Query prefix. Sibling readers and newer operations retain their own requests.
- Queued closed-panel and offline-paused navigation can be canceled. Cancellation leaves the already delivered rows, window bounds and current reading anchor intact, and publishes ready/idle rather than leaving Query loading/paused state behind.
- Source-anchor resolution stays local to the pending operation. The selected anchor is installed only when its window successfully commits, or when the selected range is already delivered. A late canceled response cannot publish that anchor or its rows.
- Successful completion, failure, supersession and disposal remove the request's abort listener. Aborting a completed signal cannot cancel a later warm seek or live-follow read.
- Cancellation sends **zero extra anchor requests**. Dossier supplies the lifetime signal and clears its explicit focus request; it has no compensating seek or retrieval-window arithmetic.

Exact shared source change: `src/client/continuous-succession-history.ts`. The optional argument flows through the existing `useSuccessionStory` return type without a hook lifecycle change.

## Timeline-owned position seam

`SuccessionTimeline` accepts a typed ref with one readonly method:

```ts
interface SuccessionTimelineHandle {
  ownsViewport(): boolean;
}
```

It uses the same `viewportOwner` selection as `WindowCommit`: the visible reader with focused content, otherwise the first visible reader. All row-coordinate capture and anchor memory remain in the timeline. The route asks which mounted timeline owns the viewport and applies Dossier-specific input/modal policy.

Exact shared source change: `src/client/succession-timeline.tsx` adds the ref and `useImperativeHandle`. Its pre-mutation `WindowCommit`, `readingRow`, `remember`, `restoreWindow` and resize/scroll behavior retain their accepted implementation.

The route's chapter classification uses explicit `data-dossier-act={chapter}`, emitted by `src/client/succession-dossier.tsx`. `src/client/succession-match.tsx` consumes the handles and the reader signal. `src/client/dossier-navigation-intent.ts` exposes its lifetime signal and deletes the duplicate row-coordinate algorithm.

## Gutter P2 · red/green

Independent evidence is preserved in `parent-gutter-red/`, including the `ab8706c` comparison. Local tests reproduce **all four failures**: wheel and native Chromium touch input, each at **1440 / 390px**, hit a noninteractive wrapping `DIV` at x=6/y=400 and leave the window at **1178–1306**.

The old policy recognized outside-chapter document scrolling only when its target was `body` or `documentElement`. A wrapper became the “other” owner, suppressing boundary reads despite Act II being visible.

The corrected policy identifies actual interactive controls and active references. A wheel/touch gesture from a noninteractive gutter or wrapper asks the timeline for the visible viewport owner. Document navigation keys do likewise; Space activation on a control retains control ownership. Modal input retains reference ownership.

`gutter-red/` records the four failures. `gutter-green/` records those four passing and two negative cases proving native wheel/touch input cannot page behind an open portrait reference while an ending response is held. The original 27 navigation scenarios also pass with explicit assertions that cancellation adds no anchor HTTP.

## Verification and source review

- **79 unit tests pass**: the original 73 plus six request-owned cancellation cases. The tests cover held anchor/page responses, paused and closed-panel requests, a sibling in the same Query cache, successor ownership, the retained-window fast path and later live follow. `reader-red.txt` records four pre-interface failures.
- **38 established browser tests pass**: all 15 continuous-history and 23 Query/current/command lifecycle tests. Fresh evidence: `history-browser/browser-results.json`. Forward tall-to-short and tall-to-omitted precommit drift is exactly **0px**; other measured cases remain within the established 1px tolerance.
- **33 actual-route navigation tests pass** in development and production: original 27 plus six gutter cases.
- **87 development / 90 production route assertions pass**, including full reverse/forward/eviction/reverse traversal and all responsive route checks. The first production pass records **0.8125px**; the final measurement after native-input settlement records **0.421875px**, with **128 rows** maximum in both.
- Typecheck, build, lint, scoped formatting and production graph/development-entry exclusion checks are recorded with the handoff.

## Independent parent drift investigation

`parent-drift-red/` preserves the parent integration's **1.8125px** production failure, runner source and source hashes. That observation is separate from the local green result. The 1px drift threshold, 128-row limit and full traversal are still enforced.

The route runner now writes `traversal.json` with per-step source key, delivered window, row geometry, viewport position and font readiness. Optional `DOSSIER_DRIFT_TRACE=1` records native scroll calls and their stacks through the verification-only `.dossier/drift-trace.mjs` helper. This supplies diagnostics without adding application instrumentation.

A clean archive of parent commit **`6c76193`** was built at `/tmp/opencode/dossier-drift-parent-6c76193` and served on owned 6292 for one diagnostic traversal. Its **90 assertions pass at 0.421875px**, including the parent's integrated portrait composition. `parent-drift-diagnostic/` records its per-step native-call traces. The original 1.8125px parent observation was not reproduced in that run and is not retrospectively marked passing.

The targeted minimal `.dossier/native-scroll-probe.mjs` establishes a measurement hazard independently of React or the reader. It starts native PageUp motion, immediately calls instant `scrollIntoView`, and measures later animation-frame movement. The browser continues moving after the instant scroll; observed uncontrolled drift reaches **945px**. `native-scroll-red.json` retains the initial experiment.

The runner now establishes its forward-traversal baseline after observing eight consecutive stable animation-frame scroll positions following the reverse walk. This is observed motion settlement, not a fixed delay or geometry adjustment. The minimal probe's three settled controls assert **0px** later movement (`native-scroll.json`). The final production route (`production-settled/route/`) still enforces the original 1px threshold and passes at **0.421875px**. `traversal-settle.json` retains the observed native-motion samples.

This proves that outstanding native-key motion can contaminate the original measurement. The exact cause of the untraced parent 1.8125px event remains unconfirmed; independent parent integrated re-verification is the acceptance gate. No application restoration change was made on the strength of that unconfirmed attribution.

## Reproduction

```sh
node .dossier/serve.mjs
DOSSIER_ENDING_EVIDENCE=../docs/evidence/TIM-23-dossier-owned-navigation/recheck-intent node node_modules/@playwright/test/cli.js test --config .dossier/ending.config.ts
DOSSIER_ORIGIN=http://127.0.0.1:6291 DOSSIER_EVIDENCE_DIR=docs/evidence/TIM-23-dossier-owned-navigation/recheck-route node .dossier/route.mjs
TIM23_EVIDENCE_DIR=docs/evidence/TIM-23-dossier-owned-navigation/recheck-history node node_modules/@playwright/test/cli.js test --config .dossier/history.config.ts
npm test -- tests/dossier-components.test.ts tests/succession-story.test.ts tests/continuous-succession-history.test.ts tests/succession-history-loading.test.ts tests/agent-picture-data.test.ts
npm run typecheck
npm run lint
npm run build
DOSSIER_PRODUCTION_EVIDENCE_DIR=docs/evidence/TIM-23-dossier-owned-navigation/recheck-production DOSSIER_EVIDENCE_DIR=docs/evidence/TIM-23-dossier-owned-navigation/recheck-production/route DOSSIER_ENDING_EVIDENCE=../docs/evidence/TIM-23-dossier-owned-navigation/recheck-production/intent node .dossier/production.mjs
node .dossier/native-scroll-probe.mjs
```

Owned development/production servers: **6291 / 6292**. The established history suite serves its in-memory fixtures via intercepted URLs, with no listener on its URL's port. All route/backend fixtures use canonical engine data. Original source captures and prior red/green evidence remain available.

Final independent parent Standards/Spec and integrated production acceptance follow this handoff.
