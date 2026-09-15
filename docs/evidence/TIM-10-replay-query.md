# TIM-10 — bounded replay Query and decision lifecycle

Base: `2cf2469`, branch `feat/tim-10-replay-query`, 2026-09-14. Implements the [TIM-8 A/B slice](../design/TIM-8-frontend-seams.md#tim-10-a--cancellable-read-and-replay-checkpoint) using the parent-installed exact `@tanstack/react-query` **5.102.8**.

## Changes and removed orchestration

| Files under `src/client/`                                                      | Delivery                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `api.ts`                                                                       | Narrow fourth-argument `{ signal?: AbortSignal }`; cancellation checked before sending, after headers, and on body success/failure. The shared body helper returns a decoded `Option`, preserving Effect codecs, structured errors, malformed-2xx/non-JSON-error fallbacks, protocol negotiation and same-origin credentials.                                                                                |
| `query-client.tsx`, `main.tsx`                                                 | One stable Query client per mounted application, with explicit defaults and no global singleton/persistence.                                                                                                                                                                                                                                                                                                 |
| `succession-replay-data.ts`                                                    | Typed Query options for replay slices, round index and opaque anchor translation. Owns endpoint construction, response correlation, bounded history walking and sibling cancellation.                                                                                                                                                                                                                        |
| `use-succession-replay.ts`, `succession-replay.tsx`                            | Replaces all three anchor/round/window HTTP effects, their `active` flags/request counter, and writable frame/events/rounds/loading/error/retry copies. Query owns results and fetching/error state. Local state holds reading choices, displayed cursor pointer and debounce readiness. Playback/visibility effects remain for their browser/timer responsibilities.                                        |
| `use-succession-match.ts`                                                      | One `useMutation` replaces manual command pending/error try/catch/finally. Captures complete request, action ID, acceptance ticket, command owner and lifetime. Accepted current transitions retire exact Query scopes while retaining `SuccessionCurrent` fences. Socket resync happens only after acceptance. Current/live-page reads retain their existing reader and gain cancellation/lifecycle guards. |
| `match-route.tsx`, `secret-overlord-match.tsx`, `use-secret-overlord-match.ts` | Reuses decoded protocol-1 initial observation/cursor; removes the duplicate initial HTTP read. Explicit retry reads fresh current state. Same-match prop recreation does not reconnect. Delta overlap uses authoritative event IDs/cursor; reset replaces the events.                                                                                                                                        |

Migrated Query endpoints: `/api/matches/:id/replay`, `/rounds`, `/history-anchor`, and **only the selected replay window** of `/history`. Mutation endpoint: `/api/matches/:id/actions`. MatchRoute, bootstrap, owner/statistics readers and ordinary live/manual history loading retain their existing ownership.

## Policies and invariants

- Read keys: contract version, match ID, protocol 2, **actual accepted audience**, local credential revision, seat generation/forfeit vector and visibility epoch, followed by resource/range. No credential/token/ticket/private payload is in a key. Normal browser revision is zero because it has no agent credential transport; owner cookies do not grant control.
- Generation/forfeit metadata supplements the proposed read-key shape: an original controller's `you.generation` need not advance when its public seat is replaced. A same-epoch takeover retires Query reads and obsolete read requests **without rewinding the live reader's still-authorized delivered prefix**. An epoch replacement masks old history before render. `SuccessionCurrent` is never recreated on an accepted transition. Command ownership is narrower: only the submitting controller's own identity/generation/forfeit state or mounted lifetime retires its command.
- Replay frames are terminal-authorized, non-actionable records: validate match, epoch, exact `through` and null controller/private fields before caching. An unexpected controller observation gets an agent-scoped key; a controller-bearing replay response is rejected rather than stored as a public frame. Revealed `archive` disclosures remain supported.
- Frozen window `(max(0, through - 32), through]`; every page requests at most **32 events / 16,384 bytes**. Byte-short pages continue from delivered cursor, at most 32 progressing pages. Mismatch, over-budget, no-progress, incomplete and unexpected page alternatives fail. Frame/events publish atomically after both succeed; failure/reset cancels the sibling read.
- Reads use `gcTime: 0`, `staleTime: Infinity`, `retry: false`, `networkMode: 'online'`, `throwOnError: false`, no focus refetch or polling, and reconnect refetch for stale/failed work. Immutable successful tuples need explicit invalidation/retirement.
- A disabled observer retains only the displayed slice while a different requested slice loads/fails. Abandoned manual refetches are cancelled only if no enabled reader still owns that key. There is no writable frame/event mirror or whole-archive `InfiniteData` cache.
- Cursor/scope changes isolate obsolete data **and errors**. New scope resets reading pointers synchronously. Seek debounce remains 80ms; playback remains 700ms after readiness, stops on error/hidden document, and waits for matching displayed/requested cursors. Offline requests show an explicit waiting status.
- A reset carries the requested scope and asks for current state once per scope; only accepted current can choose another epoch. Unchanged/failed refresh leaves explicit retry recovery. Manual retry re-arms this bounded check and targets requested/failed resources.
- Decisions use `retry: false`, `gcTime: 0`, `networkMode: 'always'`, a synchronous duplicate guard and one action ID per submission. No automatic offline command replay. Receipt identity is acknowledged independently of an older snapshot's ticket rejection, including receipts introducing a new archive epoch. Ownership is the mounted match/controller lifetime plus match ID, submitting agent/seat, its `you` generation/forfeit and its **own public seat** generation/forfeit. It excludes history epoch and every other seat. Transport retries preserve the pending guard and mutation outcome; only settlement or actual command-owner retirement releases the guard. Old-controller/unmounted success and error callbacks cannot alter current UI.
- Explicit current retry releases abandoned live-page loading state and starts disconnected until an accepted socket packet. Stream reconnect backoff/heartbeat and independent 256-event live-reader budget remain in place. There is no live `Observation2` `setQueryData` writer.

## Initial verification (`02e3ffc`)

- `npm test -- tests/client-api.test.ts tests/succession-replay-data.test.ts tests/succession-ui-stream.test.ts tests/succession-replay.test.ts` — **37 passed**. Eight API tests use an OS-assigned local HTTP port; body-abort cases verify that native `Response.bodyUsed` is true before cancellation. Nine replay-reader tests cover byte-short correlation, sibling reset cancellation, wrong cursor/epoch/match, unexpected controller frames, oversized/gapped windows, rounds/anchor correlation and audience/generation keys.
- Existing `tests/history.test.ts`, run as an artifact-path-only copy `tests/.tim10-history.test.ts` — **4 passed**, including traversal of 31,200 maximum-length four-byte messages. The fixture retains OS-assigned Worker/inspector ports; its temporary persistence was confined to this worktree.
- Existing browser regression — **59 passed in 4.0 minutes**: all 26 `succession.spec.ts` cases (including every native/composite motion case), all 22 local-game-controls cases, 5 arena cases, 3 feed cases, 2 runtime-state cases, and the sitewide malformed-response/retained-error/session-expiry case.
- Final lifecycle/scope browser run — **19 passed in 49.0 seconds**: 13 new lifecycle cases plus six repeated Succession scope/reader regressions after the current-retry correction.
- Final anchor-recovery check — **4 passed in 9.8 seconds**: the new missing-anchor/manual-retry case, successful archive-anchor translation, delayed A–B–A and retained-error/old-retry cases. Total distinct passing browser cases: **73** (59 existing + 14 new).
- Final `npm run typecheck` passed all three TypeScript projects. `npm run build` passed CLI archive and Vite production compilation (2,156 modules; JS 486.59 kB / 151.69 kB gzip). `npm run lint` passed with zero warnings/errors, `npx prettier --check` passed all changed source/test/evidence files, and the staged diff check passed.

The new browser fixture bundles the production hooks/components with an independent Query client and measures the public Query cache; it does not add production debug access. It exercises delayed A–B–A, old manual retry, concurrent observers, retained refetch errors, offline/reconnect, reset and epoch retirement, commands/receipts, takeover/unmount, stale reconnect packets, live-page retry and protocol-1 initial/delta/reset/retry behavior. Across **48 playback steps**, settled retention is asserted at **at most two replay windows / 64 events**; revisiting evicted cursor 10 causes a new read, and unmounting all replay readers removes their Query entries.

Early standalone-fixture runs exposed setup issues (Vite's array output, library-mode `process.env.NODE_ENV`, and missing UTF-8 metadata), which were corrected in the test fixture. The first complete lifecycle run passed all 12 then-present cases. Final review added a live-page retry/generation-prefix case and the corresponding loading-state correction; focused lifecycle/scope checks were repeated after that change. A final anchor-recovery case proves a successful null lookup is retried explicitly and translated if the anchor becomes available.

## Reproduction and isolation

Used Node v24.21.0, Wrangler 4.129.1, Playwright 1.63.0 and a worktree-local `npm ci --ignore-scripts --cache .agent-game/npm-cache`. Package and lockfile content remains the parent's `2cf2469` baseline.

```sh
PORT=8796 PERSIST_TO=.agent-game/tim10-state WRANGLER_LOG_PATH=.agent-game/tim10-wrangler.log npm_config_cache=.agent-game/npm-cache npx playwright test --config .tim10-playwright.config.ts --max-failures=1
```

The disposable config inherits the checked-in config, sets port 8796 health URL, `reuseExistingServer: false`, `.tim10-e2e` as test directory and `test-results/tim10` as artifact directory. The regression projects select the five complete suites above plus `sitewide.spec.ts` filtered by `/malformed responses/`. The final projects select `query-lifecycle.spec.ts` plus `succession.spec.ts` filtered by `/actual engine boards|one terminal champion|archive expansion|a replaced controller|growing history/`.

Temporary E2E copies only redirect hard-coded `/tmp/opencode/` artifacts to `.agent-game/tim10-screenshots/`. The existing `scripts/dev.mjs --test` runs the normal production build, local migrations and isolated server (inspector 9196). Local logs include `.agent-game/tim10-lifecycle-4.log`, `.agent-game/tim10-regression.log`, `.agent-game/tim10-lifecycle-final.log` and `.agent-game/tim10-anchor-final.log`. The anchor-only command adds `--grep 'missing opaque anchor|archive expansion|delayed A–B–A|retains successful data'`.

Local workerd emitted non-failing NOSENTRY RPC-size warnings during some browser starts. The history-worker run emitted JSON-drain/broken-pipe diagnostics while all four assertions completed successfully. No server/runtime changes were made for those diagnostics.

Removed `.tim10-playwright.config.ts`, `.tim10-e2e/`, `scripts/.tim10-browser.mjs` and `tests/.tim10-history.test.ts` after verification. Confirmed port **8796** is no longer listening; retained logs/screenshots and local state remain under this worktree's ignored artifact directories.

## Review follow-up — command lifetimes and pending shared readers

Lead review of `02e3ffc` found two runtime regressions despite the initial passing suite:

1. **Current retry released the unresolved command guard.** `mutation.reset()` and the connection-effect cleanup hid pending state and cleared `submitted` while its POST continued. The new held-POST + socket-fault + current-retry reproducer failed for both success and failure: Submit decision became enabled before settlement.
2. **Read scope was too broad for command ownership.** Another seat's takeover erased the unchanged submitting controller's pending state and outcome; an accepted receipt introducing the archive epoch erased its own acknowledgment. Both other-seat outcomes and the archive-receipt case reproduced red.
3. **Pending cross-reader cancellation lacked coverage.** The old sharing test completed its request before removing the mirror. New tests remove or seek the initiating reader while two enabled observers share a held request. The remaining reader receives that original result, with one HTTP request and no failed/aborted request. Both passed with the existing inactive-only cancellation policy; replay production code required no change.

The fix is confined to `use-succession-match.ts`: connection/read cleanup keeps its existing request fences, while a separate mounted command lifetime survives routine transport retry. Read-scope retirement continues to cancel and remove the exact old read prefix. A small private `commandOwner` identity excludes epoch and unrelated seats while retaining the submitting controller's own public-seat takeover fence. No observation/controller state mirror or credential-bearing cache key was introduced.

Tests use the agreed production-hook browser seam in `e2e/fixtures/query-lifecycle.tsx`, with real Query/React behavior and intercepted HTTP/WebSocket boundaries. A fixture-only direct-act button verifies the synchronous duplicate guard independently of the disabled UI. Remount now performs a fresh decoded initial read, allowing a new controller to have its own pending command when the old controller's success/failure arrives. Public-seat-only takeover cases keep `you.generation` unchanged and verify that obsolete outcomes cannot replace a current transport error.

### Red → green commands and results

All commands below use the disposable `.tim10-review-playwright.config.mjs`: `testDir: './e2e'`, `testMatch: 'query-lifecycle.spec.ts'`, one worker, `baseURL: 'http://127.0.0.1:8796'`, system `/usr/bin/chromium`, no Worker, and worktree-local `.agent-game/tim10-review-browser` artifacts. Lead configuration and artifacts were not modified.

```sh
npx playwright test --config .tim10-review-playwright.config.mjs --grep 'current retry preserves'
npx playwright test --config .tim10-review-playwright.config.mjs --grep 'another seat|receipt introducing'
npx playwright test --config .tim10-review-playwright.config.mjs --grep 'another seat|receipt introducing|current retry preserves|late command'
npx playwright test --config .tim10-review-playwright.config.mjs --grep 'remaining reader'
npx playwright test --config .tim10-review-playwright.config.mjs
```

- Retry slice: **2 failed red**, then **2 passed** after separating connection cleanup from command lifetime (`tim10-review-red-retry.log`, `tim10-review-green-retry.log`).
- Owner slice: **3 failed red** (pending/outcome loss for another seat; empty acknowledgment after archive receipt), then **7 passed** including retry and original stale-command cases (`tim10-review-red-owner.log`, `tim10-review-green-owner.log`).
- Pending shared reads: **2 passed** for unmount and seek (`tim10-review-shared-pending.log`).
- Complete lifecycle suite: **23 passed in 23.7 seconds**: all 14 initial cases plus nine new cases. Existing stale-command cases were strengthened to settle the old request while a newly mounted controller's command is pending (`tim10-review-browser-green.log`).
- Requested unit command: **37 passed** across `client-api`, `succession-replay-data`, `succession-ui-stream` and `succession-replay` (`tim10-review-unit.log`).
- Focused existing-app regression: **5 passed in 32.1 seconds**: terminal replay, archive expansion/late-live rejection, original controller replacement, and in-flight growing history at 1600/320px (`tim10-review-regression.log`).
- Follow-up `npm run typecheck` passed all three projects; `npm run lint` passed with zero warnings/errors; `npm run build` passed (2,156 modules; JS 486.89 kB / 151.77 kB gzip). Changed-file Prettier and staged diff checks passed. Confirmed port 8796 is no longer listening.

The focused app command was:

```sh
PORT=8796 PERSIST_TO=.agent-game/tim10-review-state WRANGLER_LOG_PATH=.agent-game/tim10-review-wrangler.log npm_config_cache=.agent-game/npm-cache npx playwright test --config .tim10-review-regression.config.ts
```

That disposable config inherited `playwright.config.ts`, selected `/one terminal champion|archive expansion|a replaced controller|growing history/` from an artifact-path-only copy of `succession.spec.ts`, set system Chromium, used `reuseExistingServer: false`, and wrote results under `.agent-game/tim10-review-regression`. The checked-in local dev script built and migrated before serving port 8796. One non-failing workerd NOSENTRY RPC-size warning appeared; all five tests passed.

All log names above are under this worktree's `.agent-game/`. They contain synthetic controller/action identifiers, not credentials. Removed the two disposable configs, `.tim10-review-e2e/` and `scripts/.tim10-review-copy.mjs` after verification. The follow-up has no known remaining acceptance gaps; actual credential transport remains the downstream remount/isolation boundary described below.

## Remaining limits / handoff

- The browser's real match transport is public. Entitled-controller command/replacement cases use validated protocol fixtures; future real credential replacement must remount the match lifecycle and vary credential revision. This slice adds no controller-auth or owner-session coordinator.
- Manual earlier/next-page history remains the current UX. Continuous loading and revisiting ranges beyond the reader's 256-event retention belong to TIM-23; this slice proves selected replay ranges remain reachable after Query eviction.
- Owner/bootstrap/statistics Query conversion and replay styling/layout remain downstream work. Parent is the sole Linear writer and integrator; no push/deploy or Linear edits were made.
