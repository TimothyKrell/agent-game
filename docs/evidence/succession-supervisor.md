# D14 cumulative supervisor: zero-cost evidence

Date: 2026-09-13. Sources: implementation contract §11.3 and §13.G, independent closure C2, and engine pacing report `/tmp/opencode/succession-engine-pacing.md` (engine commit `ec81fdc`, integrated locally as `2e81983`).

## Adopted operational profile

**The coordinator adopted 120-minute match runtime, 10-minute queue allowance, and 10-minute child slices as a bounded automatic-play resource profile on 2026-09-13. These values are not a full-game completion guarantee.** Decision: `/tmp/opencode/succession-runtime-decision.md`, coordinator session `ses_f684fe553ffemSRLDn9bplALFc`. The exported profile is now `frozen: true`, and omitted Succession allowances use these numbers. Existing ledgers retain their recorded settings. Secret Overlord retains its existing numeric 35-minute default.

The server continues after a client stop. A living external controller can miss a decision, pass grace, and forfeit. An existing match ID identifies a running or completed participation; it neither pauses clocks nor restores controller authority. Exhausted ledgers do not refill on restart, settings changes, or provider changes. A genuine server-confirmed new join gets its own ledger, preserving the previous ledger as a private archive.

No model invocation, paid trial, provider request, deployment, or budget increase was performed for this evidence. Native adapter tests put synthetic executables on PATH; they do not call the real Claude/OpenCode binaries.

## Actual supervisor continuity experiment

`tests/supervisor.test.ts` exercises exported `supervise`, with real private ledger files, injected clocks, injected arena responses, and injected child outcomes. It does not substitute a standalone timing/accounting calculator for the supervisor.

The adversarial Act 2 timing construction is 120 turns × (10 seconds discussion + four nearly-30-second windows), approaching **260 minutes / 4h20m** and **2,400 required submissions** (actor, nine claim reactions, target block, nine block reactions per turn). Our supervisor timeline uses the conservative 130-second-per-turn envelope. It supplies phase movement and an overall terminal observation at the end; this fixture tests supervisor continuity and resource stops, not a second implementation of the game engine.

| Explicit runtime allowance | Simulated Act 2 path | Actual supervisor result                                                               | Invocations | Synthetic accounted dollars |
| -------------------------- | -------------------- | -------------------------------------------------------------------------------------- | ----------- | --------------------------- |
| 120-minute adopted default | 260 minutes          | `client-stopped / runtime-exhausted` at exactly 120 minutes; last server status active | 12          | $0.12                       |
| 300 minutes, test-only     | 260 minutes          | Server `finished` at 260 minutes                                                       | 26          | $0.26                       |

Each synthetic invocation reports $0.01, using the same existing $2 Claude participation allowance. Native grants start at $2 and decrease with verified consumption. These amounts are arbitrary fake accounting inputs, not estimates of what either legal path costs with a model. The second row demonstrates configurability and continuity beyond six rotations; it proposes no 300-minute production default and authorizes no spend.

An additional test waits 40 virtual minutes in the parent queue under an explicit 45-minute queue allowance, then permits a 35-minute child invocation under a 40-minute slice. Queue waiting launches no model; its duration remains separate from match runtime. This covers both the removed 30-minute child cutoff and the removed 35-minute combined queue/match interpretation.

## Actual engine pacing evidence

The engine report describes 250 deterministic complete, observation-only two-act games with normal engine discussion timing. Required choices arrive one second into their window; sealed responses arrive concurrently at that same time. Strategies never consult engine internals. The engine test author reports all games finishing with one credited winner, commitment preservation, card conservation, no forfeits, and no round 13.

| Strategy family                    | Games | Full duration min / median / p95 / max | Required submissions min / median / p95 / max |
| ---------------------------------- | ----- | -------------------------------------- | --------------------------------------------- |
| Preview policy                     | 83    | 17m22s / 21m22s / 23m42s / 24m56s      | 418 / 500 / 543 / 575                         |
| Uniform observed legal choice      | 84    | 11m29s / 18m50s / 24m06s / 27m44s      | 249 / 336 / 398 / 452                         |
| Act 1 rejection / Act 2 aggressive | 83    | 12m46s / 24m37s / 28m54s / 29m47s      | 260 / 415 / 467 / 485                         |

Act 1 maximum durations by family were 620s, 1,392s, and 1,598s. Act 2 maxima were 888s, 418s, and 227s. These maxima need not occur in the same seed. There was no chat, network/model latency, grace, takeover, or platform recovery in that pacing sample. Separate engine fixtures cover takeover/recovery. The supervisor task read this report; it does not claim to have rerun those engine simulations.

All sampled synthetic games fit 120 minutes. The known 4h20m counterexample still disproves universal completion under that allowance. Fast synthetic seeds cannot establish real inference latency, strategy quality, or cost. The recommendation therefore chooses a finite client resource profile rather than changing game clocks or truncating a legal match.

## Persistence, accounting, races, and native shutdown

The implemented suite covers:

- Original server `joinedAt` and `createdAt` anchors; independent queue/runtime durations; elapsed high-water marks and process-monotonic advancement; the unchanged 35-minute legacy numeric default.
- Atomic private file replacement with file and directory fsync; exclusive lock ownership and serialized dead-PID recovery. Ownership is published by hard-linking a synced private owner file, so an empty lock cannot be exposed before PID metadata is written. Live contention reports `ELOCKED`. An actual subprocess exits during a partially charged child grant; restart recovers its dead lock, preserves the grant, and stops with unavailable accounting rather than refunding it.
- Before-spawn reservation, verified partial consumption, duplicate session-cumulative reports, watermark reuse across resumed invocations, verified unused-grant release, unknown crash remainders, and truthful over-grant reports.
- Claude’s $2 default preserved cumulatively; unsupported OpenCode local dollar limits and same-participation provider switching rejected. Provider-managed unknown spend stays null, with an explicit accounting mode and no numeric remaining-dollar claim.
- Three consecutive execution errors and three premature no-progress finals; healthy rotations reset execution errors without clearing a premature streak; material phase/act movement resets the latter. History availability, clock changes, and repeated chat are excluded from the material-progress signature.
- Queue cancellation winning, assignment winning, network failure, and a same-clock replacement ticket. Conditional DELETE includes actual `gameId`, stable `requestId`, and `joinedAt`. Once exhaustion selects the client stop, no child starts even if assignment wins.
- Runtime expiry while Act 1 executed, Act 2 eliminated, or forfeited; active child signals are aborted and local termination remains distinct from the last observed server lifecycle. User stop persists separately.
- Two concurrent supervisors on the same saved installation/config cannot reserve the same allowance. A saved config selecting another future game does not override actual participation; an explicit conflicting requested game is rejected.
- Native fake Claude receives the reserved `--max-budget-usd`; native fake OpenCode receives the documented session interrupt call; stubborn child and foreground descendant tool processes are terminated by the absolute deadline. No extra shutdown duration is appended after a slice.

`cli/supervisor.mjs` copies all installed `.mjs` modules into the persisted run directory, selects the correct packaged game rules, and passes the absolute tool deadline through `AGENT_GAME_CHILD_DEADLINE`. The CLI owner added deadline clamps to requests, retries, and waits. Protocol-2 current validation and monotonic acceptance use the shared `cli/current.mjs` boundary; the ledger retains a bounded authority/progress snapshot, not history or private replay.

## Accounting/API sources checked during implementation

- [OpenCode V2 API](https://opencode.ai/v2/docs/api) and [V2 OpenAPI](https://opencode.ai/v2/openapi.json): `POST /api/session/{sessionID}/interrupt` interrupts active service-owned execution; killing the `run` client alone is insufficient. `GET /api/session/{sessionID}` provides the session-cumulative `cost` and idle timestamp. Available cost is checkpointed against the durable session watermark; unavailable values stay unknown. Interrupt failures stop automatic resumption rather than pretending the service stopped.
- [Claude Agent SDK cost tracking](https://platform.claude.com/docs/en/agent-sdk/cost-tracking): each query invocation reports its own `total_cost_usd`, including when resuming an existing session. Native Claude totals are therefore invocation-scoped. `error_during_execution` can carry zeroed totals after a crash; such a report cannot verify unused-grant release. Reported dollars and native limits are harness accounting, not authoritative provider invoices.

## Verification commands

```sh
npx vitest run tests/supervisor.test.ts tests/supervisor-native.test.ts
npx oxlint cli/supervisor.mjs cli/ledger.mjs tests/supervisor.test.ts tests/supervisor-native.test.ts
npx prettier --check cli/supervisor.mjs cli/supervisor.d.mts cli/ledger.mjs tests/supervisor.test.ts tests/supervisor-native.test.ts docs/evidence/succession-supervisor.md
npx tsc --noEmit
```

The final scoped run passed **31 tests** (28 supervisor lifecycle and 3 native-adapter tests), with zero scoped lint errors. Scoped Prettier checks and `npx tsc --noEmit` also passed. The earlier unrelated `PhaseKind2` fixture error was fixed by its owner before this final check. No real model or paid trial was used.
