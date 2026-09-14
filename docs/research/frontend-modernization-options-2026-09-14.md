# Frontend modernization options — 2026-09-14

## Decision

**Adopt TanStack Query for a bounded HTTP-read slice, starting with Succession replay. Keep the existing validated live-state and history modules authoritative. Adopt Tailwind 4 and selected shadcn primitives incrementally; do not add TanStack DB. Defer the AI-provider decision to TIM-12.**

This is the evidence for [TIM-8's implementation proposal](../design/TIM-8-frontend-seams.md). It supports refining TIM-13, TIM-10 and TIM-11 before implementation. TIM-23 owns the continuous-list experience and automatic range loading.

| Option | Recommendation | Complexity it actually replaces |
| --- | --- | --- |
| TanStack Query | Adopt `@tanstack/react-query` 5.102.8 for the selected replay HTTP reads first | Repeated request effects, cancellation bookkeeping, per-read loading/error/retry state and concurrent duplicate HTTP work |
| Existing Succession modules | Retain `SuccessionCurrent`, `SuccessionHistory`, wire schemas and game-specific transport hooks | Already concentrate entitlement, ordering, reset and bounded-history rules that a cache cannot infer |
| TanStack DB | No present need; defer | Local relational joins, normalized reactive collections and optimistic record transactions are not the bottleneck in these screens |
| Tailwind + shadcn | Adopt Tailwind 4.3.3 with the Vite plugin and source-owned, selected Base UI-family shadcn primitives in TIM-11 | Repeated control styling and complex keyboard/focus interactions; preserve the Luminous theme |
| React effects | Replace selected HTTP-fetch effects; retain subscriptions, timers, measurement and motion effects | React lifecycle synchronization remains necessary even when HTTP state moves to Query |
| Effect library | Retain current version and codecs | The browser uses `Schema`, `Option` and `Match`; removing `useEffect` does not remove or replace these |
| TanStack AI | Brief compatibility lead only; defer to TIM-12 | Potential alternative inside `generateHouse`; no demonstrated improvement to game scheduling, dialogue quality or frontend state |

## Provenance and compatibility

Source baseline: **`c74b915f427def75681ed0c8f323c75768914e1c`**, branch `research/tim-8-frontend-seams`. The page-local game controls are **merged in this baseline**. Source and first-party documentation were inspected on **2026-09-14**. Library facts below are documentation/package evidence unless explicitly marked as exercised.

The repository pins React/React DOM **19.2.8**, Effect and `@effect/ai-openai` **4.0.0-rc.112**, Better Auth **1.7.3**, TypeScript **7.0.2**, Vite **8.2.2**, `@vitejs/plugin-react` **6.1.1**, Vitest **4.1.11** and Playwright **1.63.0**. Node is declared **>=22.12.0**. `tsconfig.json` uses ES2022, DOM libraries, ESNext modules and Bundler resolution. `vite.config.ts` is a normal React SPA configuration with an HTTP/WebSocket `/api` proxy. None of the proposed frontend libraries is currently a direct dependency. [S1]

Publisher-supplied npm metadata was queried directly using `https://registry.npmjs.org/<package>/latest`, with exact-version links recorded here. “Compatible” means the declared ranges admit the repository's versions; it does not mean an application build was run.

| Package / source | Observed version | Compatibility / maturity evidence |
| --- | --- | --- |
| [React Query](https://registry.npmjs.org/@tanstack/react-query/5.102.8) / [Query Core](https://registry.npmjs.org/@tanstack/query-core/5.102.8) | 5.102.8 / 5.102.8 | React peer `^18 \|\| ^19`; React adapter depends on exactly this core version. Core semantics exercised below. Use ordinary `useQuery`, not Suspense hooks, for the cancellable slice. |
| [React DB](https://registry.npmjs.org/@tanstack/react-db/0.3.8) / [DB](https://registry.npmjs.org/@tanstack/db/0.9.0) / [Query collection](https://registry.npmjs.org/@tanstack/query-db-collection/1.2.13) | 0.3.8 / 0.9.0 / 1.2.13 | React DB admits React >=16.8; DB admits TS >=4.7; collection admits Query Core ^5. Core/React packages remain pre-1.0. Lack of a needed feature, rather than a peer conflict, drives deferral. |
| [Tailwind](https://registry.npmjs.org/tailwindcss/4.3.3) / [Vite plugin](https://registry.npmjs.org/@tailwindcss/vite/4.3.3) | 4.3.3 / 4.3.3 | Plugin admits Vite `^5.2.0 \|\| ^6 \|\| ^7 \|\| ^8`; both versions align. CSS build-time integration, no new frontend runtime state manager. |
| [shadcn](https://registry.npmjs.org/shadcn/4.21.0) | 4.21.0 | CLI declares Node >=20.18.1. Current manual guide supplies `base-nova` configuration; older Tailwind-v4 upgrade guidance still mentions `new-york`. Prefer the current installation/selected primitive source, not a copied old upgrade recipe. |
| [Base UI React](https://registry.npmjs.org/@base-ui/react/1.8.0) | 1.8.0 | React/React DOM peers admit 17, 18 and 19; Node >=14. Import only the primitives chosen by the design. The optional date-related peers are not a reason to add a calendar stack. |
| [TanStack AI](https://registry.npmjs.org/@tanstack/ai/0.54.0) / [OpenAI adapter](https://registry.npmjs.org/@tanstack/ai-openai/0.22.6) / [Cloudflare adapter](https://registry.npmjs.org/@tanstack/ai-cloudflare/0.1.1) | 0.54.0 / 0.22.6 / 0.1.1 | AI declares Node >=18; adapters require AI ^0.54.0. These are pre-1.0 packages. Workers binding support is documented, but not tested here. |
| [TanStack AI React](https://registry.npmjs.org/@tanstack/ai-react/0.24.1) | 0.24.1 | React/DOM/types >=18 and AI ^0.54.0 peers. A chat-UI package has no role in this server-side house decision spike. |

The current Query reference includes newer imperative `query()` terminology and deprecations for `fetchQuery()`. The proposed first slice uses the established `queryOptions`/`useQuery`/`invalidateQueries` surface. Implementation must pin the selected version, not assume that a moving `latest` page describes a different installed version. The exact published core source inspected is in the [5.102.8 tarball](https://registry.npmjs.org/@tanstack/query-core/-/query-core-5.102.8.tgz), `src/query.ts` and `src/queryObserver.ts`. Guessed GitHub `v5.102.8` raw-source URLs returned 404; they are not evidence. [Q1–Q6]

## Current application findings

| Source at the baseline | Observed responsibility / consequence |
| --- | --- |
| `src/client/main.tsx:98–151` | `useLoad` has a **visit object and per-visit sequence**, retains successful data on a refresh failure in that visit, and suppresses old visits/manual retries. It does not abort HTTP work or share a cache. A pathname-only stale guard would be a regression. |
| `main.tsx:540–580`, `2677–2740` | App reads default bootstrap every 15s. Home additionally reads selected bootstrap every 10s, both archive bootstraps every 30s, and selected contenders every 30s. Bootstrap includes owner information, so it is not a wholly public cache document. |
| `main.tsx:959–1053` | MatchRoute fetches a union observation to dispatch protocols. Secret Overlord then fetches the same current endpoint again before opening its cursor WebSocket. Passing the decoded initial observation into an extracted hook removes this waterfall without a new protocol. |
| `main.tsx:1710–1805` | OwnerDashboard reads default owner data and selected statistics separately, both every 10s. The default read deliberately keeps roster identity, queue participation, pairing and drafts independent of a failing statistics pool. Equivalent endpoint requests can be shared; these responsibilities must remain independent. |
| `main.tsx:1540–2191` | Local login, sign-out, create/retire agent, pairing approval, revocation and provider linking are event-handler operations with pending/error feedback. Successful owner operations refresh both owner reads. Pairing details have their own effect and expiry error. |
| `main.tsx:2263–2470`, `game-selection.tsx`, `navigation.ts` | Profile identity survives a statistics-pool change; pool statistics do not. URL choices are local (`gameId`, `standingsGame`, `playGame`); navigation uses `useSyncExternalStore`. Whole-page remounts on game choice would lose intended UI state. |
| `api.ts:7–63` | One transport module owns `X-Agent-Game-Protocols: 1,2`, same-origin credentials, body serialization, `ApiError` with structured details, HTTP failures and Effect Schema success decoding. It lacks AbortSignal input. |
| `succession-stream.ts:3–56` | `SuccessionCurrent` rejects retired epochs, old revision tickets, mismatched match/controller identity, terminal/act regression and generation/forfeit regression. The revision is **local**, not a server mutation counter. |
| `succession-stream.ts:59–145` | `SuccessionHistory` freezes a walk's `through`, advances only to the delivered `cursor`, validates contiguous IDs and progress, retains 256 events and can seek back into evicted ranges. Requests are capped at 32 events / 16KiB. |
| `use-succession-match.ts:25–202` | WebSocket packets are decoded before acceptance. The hook owns a connection-generation fence, reconnect backoff, heartbeat, current/receipt tickets and a separate page-request fence. Current notification does not mean history has been delivered. |
| `succession-replay.tsx:21–201` | Replay has its own cursor and bounded reader; frame and selected 32-event window load together. Byte bounds may require multiple pages. Round/anchor responses also carry reset alternatives. Playback pauses on hidden documents. |
| `match-feed.tsx:28–71`, `motion.tsx`, six imports at `main.tsx:55–60` | Reading anchors, folds, following and motion are presentation state. Authorized stream IDs can change at archive expansion; `eventKey` carries reading identity. CSS currently relies on ordered, unlayered styles and root-token overrides. |

### React `useEffect` versus the Effect library

React defines effects as synchronization with an external system, with cleanup on dependency changes/unmount and an extra setup/cleanup cycle in development Strict Mode. Its docs recommend calculating derived data during render, handling user commands in event handlers, and using a cache for repeated HTTP-fetch concerns. [R1, R2]

Apply that distinction concretely:

- **Move into Query:** replay frame/window, rounds and anchor request effects; later selected `useLoad` readers and pairing details.
- **Keep as effects inside focused hooks:** WebSocket setup/cleanup, heartbeat/backoff, active request cancellation, document-visibility playback pause, clocks, DOM scroll-anchor restoration and motion/measurement. A small effect that reacts to an accepted visibility change and invalidates a read is legitimate synchronization.
- **Keep as ordinary calculations:** selected match lookup, merged/sorted three-match archive, ratings presentation, `replayFrame`, phase labels and history filtering.
- **Keep as user commands:** local login, provider actions, pairing approval, retirement, revocation and game decisions. Query mutations may track their lifecycle; a render effect must not initiate them.
- **Retain Effect codecs:** client imports are `Schema`, `Option`, `Match`, not an Effect runtime driving React fetching. Shared protocol validators and server `Effect.timeout`/layers have separate jobs. [S2–S6]

## Query: supported capabilities and important limits

1. **Keys identify returned data.** Query keys are serializable arrays; every changing data input belongs in the key. Endpoint text alone misses session, game, audience, epoch and selected range. Deterministic object-key hashing does not make different array order equivalent. [Q1]
2. **Cancellation is opt-in at the transport.** Query supplies `signal`; when the last observer leaves and that signal was consumed, the request is cancelled and state reverts. Without consumption, an unused request may finish into the cache. Another active observer can legitimately keep it alive. The library cannot cancel a request that never receives the signal. [Q2, published `query.ts:360–383`]
3. **Cached A is different from abandoned A.** A–B–A can show a completed A from cache immediately; cancellation does not erase previously successful data. The existing statistics UI begins a new visit without the old pool snapshot. Preserve that behavior in the selected migration, and explicitly test any later warm-cache UX before adopting it. [Q2, experiment below]
4. **Polling is observer-owned.** Each polling observer has its own timer. Concurrent requests share work, but two staggered observers can still produce two requests. `staleTime` does not disable interval polling. Assign a single poll owner per canonical resource rather than assume Query deduplicates all timers. [Q3, published `queryObserver.ts:411–430`]
5. **Defaults are a behavior change.** Stale immediately, 5-minute inactive retention, three retries, stale refetch on mount/focus/reconnect, and foreground-only interval polling are defaults. Configure them explicitly. HTTP Query reconnect is not WebSocket resynchronization. [Q3, Q4]
6. **Error is compatible with retained data.** Initial failure and background-refetch failure need different rendering. Keep `ApiError` structured data; don't replace it with a boolean. Query's `networkMode: 'online'` can be pending **and paused** without actually fetching. [Q5, experiment]
7. **Mutation success can await invalidation.** Returning the invalidation promise from `onSuccess` keeps the mutation pending until it settles. A successful command followed by failed readback is still an accepted command. Invalidation normally marks matching entries stale and refetches active ones; it neither erases authorization-sensitive data nor necessarily rejects on refetch failure. [Q6, Q7]
8. **`setQueryData` is not a revision fence.** It is an immutable cache write; a later unguarded HTTP completion can replace it. Query knows neither Succession visibility epochs nor takeover generations. Choose one authoritative current-state writer and retain the validators. [Q6, experiment]

### Selected realtime integration

The first slice uses **WebSocket → schema decode → `SuccessionCurrent.accept` → accepted current state → Query read lifecycle**. The current hook owns live `view`; Query owns replay resources. Accepted epoch changes retire old read keys and select new ones. Same-epoch live head growth updates history availability, without refetching historical resources: the current server exposes `/replay` and `/rounds` only after overall termination (`src/server/match.ts:697–755`). Replay frames never become actionable current observations. No raw packet handler writes a cache entry. [S4, S5]

This removes the replay HTTP effects while keeping current-state acceptance deep and local. Putting a second copy of `view` in Query, with effects synchronizing it back and forth, would increase the interface and create two writers. A later move of current state into Query would need **every** HTTP/receipt/socket write to pass the same acceptance module, atomically with publication; it is not needed for TIM-10.

### Why TanStack DB is not needed

The first-party DB docs describe normalized collections, reactive cross-collection queries/joins, optimistic transactions, eager/on-demand sync and direct writes from WebSockets. Thus “DB cannot handle realtime” would be incorrect. [D1, D2]

The actual mismatch is responsibility:

- Match observations are authoritative game documents, not editable relational rows. A ten-seat board and a selected 32-event replay window do not need a local join engine.
- Succession pages are an **authorized, bounded projection in an epoch**, with a frozen target and possibly byte-short pages. A Query Collection normally reconciles a returned collection state; on-demand mode requires implementing its subset/predicate contract. Neither mode removes delivered-cursor validation, old-epoch rejection or arbitrary-range revisiting.
- The docs explicitly warn that a capped endpoint page must not be treated as a complete on-demand result, and that subsequent query sync can replace direct-written rows. An adapter would have to reproduce our history rules to prevent false exhaustion or disappearing records.
- Agent decisions are server-validated commands with phase/decision/action identity. Optimistic local edits to coins, capabilities or entitlement would assert facts before server acceptance.

Revisit DB only if measured costs or a concrete feature require repeated reactive joins over substantial normalized data, or genuine client optimistic record transactions. A long continuous timeline by itself requires range loading and bounded rendering; it does not establish that need.

## Tailwind and shadcn: compatible, with explicit cascade ownership

Tailwind's first-party Vite guide supports adding the plugin to this SPA. Version 4 targets Chrome 111+, Safari 16.4+ and Firefox 128+; newer optional utilities can have stricter browser requirements. The repo's browser checks do not by themselves certify all these engines. [T1, T2]

The normal `@import 'tailwindcss'` includes Preflight, which resets margins, heading styling, border styles and replaced-element display. That is unsuitable as an unreviewed addition to the current six-sheet cascade. Tailwind documents importing theme and utilities separately to omit Preflight. Normal unlayered author rules outrank normal layered rules regardless of a utility's specificity or later import position. Merely appending utilities would therefore not give predictable control over the current global `h1`, `p`, `button` and `.panel` rules. [T3, C1]

TIM-11 should own a single stylesheet manifest, import the existing six sheets in their original order **into one `legacy` layer**, and place the new scoped primitive styles/utilities above that layer. Introduce **no global Preflight** and no generated global `body`/`*` shadcn theme reset. Scope tokens and primitive baseline styling to the new replay root and its portal roots. Preserve font imports and existing important reduced-motion/focus rules when moving imports. Verify the cascade-only change before styling controls. The exact suggested shape is in the design note.

Current shadcn documentation supports React 19/Tailwind 4, source-owned primitives, CSS-variable theming and configurable placement. Its current manual installation uses `base-nova`, `cn`, and optional shared Tailwind styles; do not blindly install an older Radix/new-york recipe or the entire current template. Use the selected **Base UI family** consistently for any complex primitives. Copy only the needed primitive source and required dependencies, adjusting to the repository's relative imports. This avoids introducing project-wide aliases solely for code generation. [U1–U4]

The theme should map semantic roles (background, surface, foreground, muted foreground, border, focus ring, cooperative, rogue, neutral/partial, accent) to the existing Luminous tokens or approved design updates. Keep game-faction colors separate from destructive-action meaning. Default shadcn radii/colors/animations are not the art direction. `--muted` currently means muted **text** here, whereas shadcn commonly uses it for a **background**; use namespaced source tokens rather than overwrite that name globally. [S7, U3]

**Dependency ownership:** parent/integration coordinator is the sole `package.json`/`package-lock.json` writer for the first downstream batch. TIM-10 supplies the Query package request; TIM-11 supplies Tailwind/primitive dependencies and owns CSS/primitive source. Install exact versions in one integration checkpoint, regenerate the lockfile once, and rebase feature branches onto it. This note changes neither production manifest nor lockfile.

## Deferred TIM-12: a short provider compatibility lead

The relevant seam is `src/server/house-model.ts:269–324`, `generateHouse(env, config, prompt, deadline, choiceCount, system)`. It chooses an OpenAI or native Workers AI layer, constrains a single structured decision, applies the remaining-deadline/25s timeout and returns the decoded value plus token usage. The native adapter rejects tools (`house-model.ts:43–49`). Game scheduling, takeover, persistence, phase validation and admission cost accounting are outside this seam. [S8]

Current TanStack AI docs advertise both OpenAI Responses and Chat Completions adapters, structured outputs, tools and streaming. There is now a **first-party Cloudflare adapter with `binding: env.AI` support**; do not assume Workers AI requires an OpenAI-compatible proxy. Structured output docs distinguish Standard **JSON** Schema conversion from validation and distinguish streamed from awaited validation paths. [A1–A4]

TIM-12 should test one awaited structured decision against `generateHouse`'s contract, preserving Effect decoding, legal choice range, message/notes bounds, deadlines and token/cost reporting. It must verify actual configured models, Effect 4's JSON-schema interoperability, cancellation/timeout propagation for the native binding and OpenAI path, retries within remaining budget, and Workers bundling. The documented adapter's existence is compatibility evidence, not proof of parity. No provider call, Workers smoke test, latency/cost comparison or AI migration was performed for TIM-8. The frontend does not need `@tanstack/ai-react` to display game dialogue.

## Experiment and verification record

An isolated disposable experiment ran **inside this worktree** in `.tim8-query-experiment`, with only `@tanstack/query-core` **5.102.8**, on Node **v24.21.0**. Install used `--ignore-scripts --no-audit --no-fund` and a cache inside that directory. It exercised `QueryClient`/`QueryObserver` with deferred promises and Node strict assertions, not React or a real network. The disposable directory was removed after recording results.

| Assertion actually run | Result |
| --- | --- |
| Consume signal; observe A, switch to B, then A; resolve newest A, then both abandoned requests | PASS: old A/B signals aborted and newest A remained visible even when ignored-transport promises resolved late |
| Add a second observer while an A refetch is pending | PASS: no second in-flight query-function invocation |
| Reject that refetch after a successful A | PASS: data retained and `isRefetchError` true |
| Revisit a previously completed A with stale time zero and positive GC retention | PASS: cached A visible immediately while a new A request runs |
| Begin HTTP refetch, publish a socket-like value with `setQueryData`, then resolve HTTP with older data | PASS: older HTTP overwrote the cache value, demonstrating the need for game fences |

The exact command run was `node .tim8-query-experiment/probe.mjs`. The core source was also inspected for last-observer cancellation and per-observer polling timers. These results support the selected library policy; they do not verify DOM behavior, browser fetch abortion, timers in background tabs, stream integration or CSS rendering.

No production application code or dependency changes were made. Existing test sources were inspected, including `tests/succession-ui-stream.test.ts`, `e2e/local-game-controls.spec.ts`, `e2e/succession.spec.ts` and `e2e/sitewide.spec.ts`; those suites were **not run** for this documentation task. Downstream acceptance checks are listed in the design note.

Documentation checks passed: `git diff --cached --check`, balanced fenced blocks, all 25 local Markdown links across the two deliverables, and removal of the disposable experiment directory.

## Sources

Repository references use the baseline above; line numbers are provenance, not promised future locations.

- **S1:** [package.json](../../package.json), [lockfile](../../package-lock.json), [tsconfig](../../tsconfig.json), [Vite config](../../vite.config.ts).
- **S2:** [main.tsx](../../src/client/main.tsx), especially 98–151, 540–580, 959–1053, 1540–2191, 2263–2470, 2677–2740.
- **S3:** [client transport](../../src/client/api.ts), [shared schemas](../../src/shared/api.ts), [worker routing](../../src/server/worker.ts) 89–113 and 319–379. Browser requests without Authorization are public match reads; owner cookies are not agent-controller grants.
- **S4:** [Succession acceptance/history](../../src/client/succession-stream.ts), [mixed-transport tests](../../tests/succession-ui-stream.test.ts).
- **S5:** [Succession hook](../../src/client/use-succession-match.ts), [container](../../src/client/succession-match.tsx), [replay](../../src/client/succession-replay.tsx), [server replay/round eligibility](../../src/server/match.ts) 697–755.
- **S6:** [game selection](../../src/client/game-selection.tsx), [navigation](../../src/client/navigation.ts), [feed](../../src/client/match-feed.tsx), [motion](../../src/client/motion.tsx).
- **S7:** [base styles](../../src/client/styles.css), [Luminous styles](../../src/client/luminous.css), [page-local acceptance](../../docs/page-local-game-controls.md).
- **S8:** [house model](../../src/server/house-model.ts), [house contract](../../src/server/house-contract.ts).
- **R1:** React, [useEffect](https://react.dev/reference/react/useEffect).
- **R2:** React, [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect).
- **Q1:** TanStack Query, [query keys](https://tanstack.com/query/v5/docs/framework/react/guides/query-keys).
- **Q2:** TanStack Query, [cancellation](https://tanstack.com/query/v5/docs/framework/react/guides/query-cancellation).
- **Q3:** TanStack Query, [polling](https://tanstack.com/query/v5/docs/framework/react/guides/polling).
- **Q4:** TanStack Query, [important defaults](https://tanstack.com/query/v5/docs/framework/react/guides/important-defaults).
- **Q5:** TanStack Query, [network modes](https://tanstack.com/query/v5/docs/framework/react/guides/network-mode).
- **Q6:** TanStack Query, [QueryClient reference](https://tanstack.com/query/latest/docs/framework/react/reference/QueryClient).
- **Q7:** TanStack Query, [invalidations from mutations](https://tanstack.com/query/v5/docs/framework/react/guides/invalidations-from-mutations).
- **D1:** TanStack DB, [overview](https://tanstack.com/db/latest/docs/overview).
- **D2:** TanStack DB, [Query collection](https://tanstack.com/db/latest/docs/collections/query-collection), particularly full-state sync, direct writes and server pagination.
- **T1:** Tailwind, [Vite installation](https://tailwindcss.com/docs/installation/using-vite).
- **T2:** Tailwind, [compatibility](https://tailwindcss.com/docs/compatibility).
- **T3:** Tailwind, [Preflight and selective imports](https://tailwindcss.com/docs/preflight).
- **C1:** MDN, [cascade order and layers](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascade/Introduction).
- **U1:** shadcn, [current manual installation](https://ui.shadcn.com/docs/installation/manual).
- **U2:** shadcn, [components.json](https://ui.shadcn.com/docs/components-json).
- **U3:** shadcn, [Tailwind 4 / React 19](https://ui.shadcn.com/docs/tailwind-v4).
- **U4:** shadcn, [Base UI dialog](https://ui.shadcn.com/docs/components/base/dialog).
- **A1:** TanStack AI, [overview](https://tanstack.com/ai/latest/docs/getting-started/overview).
- **A2:** TanStack AI, [OpenAI adapter](https://tanstack.com/ai/latest/docs/adapters/openai).
- **A3:** TanStack AI, [Cloudflare adapter](https://tanstack.com/ai/latest/docs/adapters/cloudflare).
- **A4:** TanStack AI, [structured outputs](https://tanstack.com/ai/latest/docs/structured-outputs/overview).
