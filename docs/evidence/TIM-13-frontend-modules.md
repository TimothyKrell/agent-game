# TIM-13 — mechanical frontend extraction

Base: `d8ab170` on `refactor/tim-13-frontend-modules`, 2026-09-14.

## Delivery

Applied the [TIM-8 extraction table](../design/TIM-8-frontend-seams.md#tim-13-exact-first-extraction).
`src/client/main.tsx` is now 1,263 lines (from 2,740), retaining application composition, Home, public statistics/profile pages and rules.

| Module under `src/client/`     | Exported interface                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `ui/link.tsx`                  | `Link`                                                                                |
| `ui/resource-state.tsx`        | `ErrorBox`, `ResourceState`; private `Loading`                                        |
| `ui/identity.tsx`              | `Badge`, `Avatar`                                                                     |
| `use-load.ts`                  | `useLoad`                                                                             |
| `site-bootstrap.ts`            | `SiteBootstrap`, `SiteBootstrapSchema`                                                |
| `agent-onboarding.tsx`         | `AgentOnboarding`                                                                     |
| `owner-sign-in.tsx`            | `SignIn`                                                                              |
| `owner-dashboard.tsx`          | `Dashboard`; private `OwnerDashboard`, `QueueDetail` and account/pairing coordination |
| `use-secret-overlord-match.ts` | `useSecretOverlordMatch` (formerly private `useMatch`)                                |
| `secret-overlord-match.tsx`    | `SecretOverlordMatch` (formerly private `LiveMatch`); private `MatchResult`           |
| `match-route.tsx`              | `MatchRoute`; private protocol union schema                                           |

**Table correction:** `PolicyTrack` has only one caller, Home's arena preview, and none in the match container. It stays private in `main.tsx` beside that consumer. No new cross-feature export is needed.

The move preserves props, function bodies, DOM structure, classes, keys, decoder/error handling, polling intervals, visit/request fences, socket merge/retry/heartbeat behavior and route dispatch by decoded protocol. Secret Overlord's duplicate initial fetch remains for TIM-10. Existing Succession state/history ownership is intact. There are no CSS, dependency, package/lockfile, API transport or production test changes.

## Verification

- Exact source comparison against `d8ab170:src/client/main.tsx`: all **31 function definitions**, all **three schema/type declarations** and the root render match after normalizing exports and the two requested names. This was an ad hoc read-only comparison, not a committed layout test.
- `npm run typecheck` — passed all three TypeScript projects.
- `npm run lint` — passed, zero warnings/errors.
- `npm run build` — passed (CLI archive and Vite production bundle; final run after extraction cleanup).
- `npx prettier --check` on `main.tsx` and the eleven extracted modules — passed.
- `npm test -- tests/succession-ui-stream.test.ts tests/succession-replay.test.ts` — **20 passed** across two files.
- `git diff --check` — passed.

- Browser verification — **50 passed in 1.7 minutes**, one worker, no retries:
  - `e2e/local-game-controls.spec.ts`: all 22 cases.
  - `e2e/arena.spec.ts`: all 5 cases, including real pairing/revocation, persistent roster/sign-out and the live exhibition-to-replay flow.
  - `e2e/luminous.spec.ts`: all 3 cases.
  - `e2e/runtime-states.spec.ts`: both cases.
  - `e2e/sitewide.spec.ts`: all 10 cases, including provider callback, expired pairing, pending/error recovery, malformed responses, session expiry and responsive shared UI.
  - `e2e/succession.spec.ts`: 8 focused cases — actual engine boards/protocol dispatch, terminal two-act replay, rules/back navigation, archive-anchor expansion, cap/interruption outcomes, replaced-controller cutoff, and delayed growing history at 1600/320px.
- The browser server's existing lifecycle ran `npm run build` and local D1 migrations successfully before serving the tests.

No behavior differences were found. Local workerd emitted non-failing `NOSENTRY` warnings for an RPC message size limit and a SQLite alarm-manager timing mismatch; the real owner/exhibition cases and all subsequent cases passed. Raw output is retained locally at `.agent-game/tim13-browser.log`.

## Verification isolation

Used Node v24.21.0, Wrangler 4.129.1 and Playwright 1.63.0 with a worktree-local copy of the existing lock-compatible `node_modules`. Playwright used `PORT=8796`, inspector port 9196, local persistence `.agent-game/tim13-state` and the existing `scripts/dev.mjs --test` build/migration/server lifecycle. A disposable config set `reuseExistingServer: false`.

Disposable copies of existing E2E sources redirect their hard-coded `/tmp/opencode/` screenshots into this worktree's `.agent-game/tim13-screenshots/`; assertions, routes, fixtures and timings are identical. Standard Playwright artifacts go to `test-results/tim13`. The selected cases cover local game controls, real onboarding/owner sessions and exhibitions, pairing/auth/account failures, public resource recovery, Secret Overlord live/replay states and Succession protocol dispatch, replay, archive anchors and delayed history.

The exact invocation was:

```sh
PORT=8796 PERSIST_TO=.agent-game/tim13-state WRANGLER_LOG_PATH=.agent-game/tim13-wrangler.log npm_config_cache=.agent-game/npm-cache npx playwright test --config .tim13-playwright.config.ts
```

The disposable config inherited the checked-in config, used `.tim13-e2e` as its test directory and the five complete suites above in one project. A second project selected `succession.spec.ts` with `/actual engine boards|one terminal champion|rules scope|archive expansion|cap criteria|a replaced controller|growing history/`. The temporary config, source copies and artifact-redirection helper were removed after verification; the isolated server shut down with Playwright.

Parent remains the sole Linear writer and integrator. No push or Linear changes were made.
