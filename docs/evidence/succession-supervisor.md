# D14 cumulative supervisor: zero-cost evidence

Date: 2026-09-13. Sources: implementation contract §11.3 and §13.G, independent closure C2, and engine pacing report `/tmp/opencode/succession-engine-pacing.md` (engine commit `ec81fdc`, integrated locally as `2e81983`).

## Adopted operational profile

**The coordinator adopted 120-minute match runtime, 10-minute queue allowance, and 10-minute child slices as a bounded automatic-play resource profile on 2026-09-13. These values are not a full-game completion guarantee.** Decision: `/tmp/opencode/succession-runtime-decision.md`, coordinator session `ses_f684fe553ffemSRLDn9bplALFc`. The exported profile is now `frozen: true`, and omitted Succession allowances use these numbers. Existing ledgers retain their recorded settings. Secret Overlord retains its existing numeric 35-minute default.

The server continues after a client stop. A living external controller can miss a decision, pass grace, and forfeit. An existing match ID identifies a running or completed participation; it neither pauses clocks nor restores controller authority. Exhausted ledgers do not refill on restart, settings changes, or provider changes. A genuine server-confirmed new join gets its own ledger, preserving the previous ledger as a private archive.

No model invocation, paid trial, provider request, deployment, or budget increase was performed for this evidence. Native adapter tests put synthetic executables on PATH; they do not call the real Claude/OpenCode binaries.

## Actual supervisor continuity experiment

`tests/supervisor.test.ts` packages the CLI archive, extracts it outside the checkout, and imports that installed archive's exported `supervise`, with real private ledger files, injected clocks, injected arena responses, and injected child outcomes. It does not substitute a standalone timing/accounting calculator for the supervisor. The CLI owner added installed first-child assignment and different-game cancellation-race assertions during integration.

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

Before the first child and subsequent invocations, the parent publishes actual `matchId` and `participation: {gameId, matchId}` into the connection file under the shared `config.current` lock. It reads the latest config inside that lock and changes only assignment identity, preserving any concurrently updated observation/history cache. The replacement file is private and synced before rename. Thus an autonomous parent-owned join is immediately usable by the child's ordinary `observe --config` command. If a conditional cancellation returns an assigned match in another game, the stopped supervisor adopts that actual game before its bounded observation; the already-selected queue stop remains durable for that same assigned match.

## Legacy supervisor migration and missing evidence

The old supervisor did not persist session IDs or usage in the connection file. Its surviving local evidence is the `run-*` directory it created beside that file. Before creating a first D14 ledger, the supervisor checks the config parent for any `run-*` entry. With no existing D14 ledger, that evidence marks prior accounting **unknown**, even when the connection contains no session or usage fields. Explicit legacy `sessionId` or `supervisedSessionId` fields, if present, also mark it unknown.

For Claude, this recognized legacy state returns `client-stopped / accounting-unavailable` before launching a child. It reports `costUsd: null`, `accounting.observed: false`, `accounting.unknown: true`, and zero spendable remainder. The internal `known: 0` is the amount of newly verified consumption recorded in this ledger, **not a reconstruction or assertion that the old run cost zero**. The nominal $2 limit cannot be spent while the historical accounting is unavailable. Restarting this new ledger preserves that stop. The migration does not invent an old child grant, session watermark, or historical invoice amount.

The scan is deliberately conservative: old directories cannot reliably be attributed to a particular config or match when several configs share a parent. It may therefore block a fresh config in such a shared directory. An ordinary first play immediately after joining, with no prior ledger, no legacy session marker, and no `run-*` evidence in its config parent, receives the legitimate existing $2 default; joining alone does not create a supervisor run directory. A server-confirmed genuinely new participation following an existing D14 ledger receives new per-participation allowances and archives the prior ledger.

If all old run directories and other local evidence were removed or the connection was copied without them, historical supervision is unobservable to this implementation. It cannot distinguish that state from an installation never supervised before, and it cannot recover or claim knowledge of prior cost. There is no claim that local accounting survives deletion of all its evidence. The legacy test covers surviving `run-*` evidence without any saved usage; separate before-spawn tests verify the legitimate initial $2 reservation.

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

The supervisor lifecycle gate passed **33 tests** (30 installed-supervisor lifecycle and 3 native-adapter tests). Five additional result tests cover winning-seat credit, a forfeited champion, a loser, interruption, and an active client stop. No real model or paid trial was used.

## Packaged CLI and actual Worker integration

`tests/cli-worker.test.ts` installs the actual `0.2.0` archive with npm into an unrelated `/tmp/opencode` directory, then invokes its npm bin against a real isolated local Worker. The reusable fixture from `ab2ebf7` delegates to the production Worker, MatchObject, MatchmakingObject, HouseSeatObject, D1 migrations, receipts, outbox, history and controller projection. It creates one external grant plus nine preview-house seats. Only discussion/fill clock expiration is fixture-controlled; required decision windows retain their normal rule timing.

The integration passed in **22.7 seconds** on 2026-09-13. This is a local test duration with controlled discussion clocks, not a production match-duration measurement. It verifies:

- Installed `setup --game succession`, real bearer-grant authorization, queue assignment and current/action/wait play through both acts to one individual result without an external forfeit.
- The immutable installed `0.1.1` binary encounters the same Succession installation and receives `protocol-upgrade-required` through both status and observe.
- Full actual terminal archive retrieval from the server with explicit epoch/after/through, 64-event count ceiling and 12,288-byte page budget. All IDs are contiguous, all opaque keys unique, and both acts are present.
- The same saved profile and token subsequently join and finish standalone Secret Overlord through the installed CLI. New participation clears prior current/history state.

`tests/cli-succession.test.ts` separately tests delayed live current, receipt and page arrival after accepted terminal/archive state, retained takeover entitlement, child deadline propagation, and a complete engine-backed HTTP fixture. `tests/cli-legacy-play.test.ts` installs both retained `0.1.1` and current `0.2.0` to complete original-game fixtures with unchanged protocol-1 action envelopes. `tests/cli-install.test.ts` checks both harness installations, credential redaction, selected rules and retained legacy archive publication on a clean package build.

The complete CLI/supervisor set is:

```sh
npx vitest run tests/cli-worker.test.ts tests/cli-succession.test.ts tests/cli-legacy-play.test.ts tests/cli-install.test.ts tests/cli-output.test.ts tests/supervisor.test.ts tests/supervisor-native.test.ts tests/supervisor-result.test.ts
npx oxlint cli scripts/package-cli.mjs src/shared/onboarding.ts tests/cli*.test.ts tests/supervisor*.test.ts
```

Native-adapter fake executables and observation-only house preview policies incur no model usage. Production paid-provider latency, model strategy and invoice costs were not measured.

The final scoped integration checks cover **52 tests** across those eight files. The actual Worker case passed again after the C1 changes (25.4 seconds); the seven-case installed Succession suite passed after correcting its queue fixture to include the protocol identity. TypeScript and scoped lint/format checks passed. C1 now includes concurrent delayed queue/current/receipt responses and both old data pages and archive-targeting reset pages after another reader has advanced the archive walk. All config writers serialize owned-field updates under the same lock and check connection/participation identity.

### Queued-participation review follow-up

Independent review confirmed the original terminal/status and reset-cursor repros were fixed, then identified a further queued-state transition: an old response could restore a previous match after a new join cleared `matchId`. Commit `5735d23` captures the request's participation identity before waiting and checks it under the shared lock, including a new pending queue request with no match selected. Stale receipts still report their accepted action ID independently, without exposing the obsolete current; history with no remaining accepted observation reports `stale-page`.

Four additional installed-CLI cases hold live current, terminal current, receipt, and history responses across an actual CLI new queued join. All four plus the original three focused C1 cases passed (seven cases, 1.8 seconds). The independent reviewer's original queued-state reproduction, run against the fix, preserves the new queue exactly and reports `restoredOldMatchOverNewQueue: false`. Independent closure of this follow-up was requested from the reviewer.

The actual Worker test also now submits `act --json` chat with the optional `decisionId` omitted while a required decision is cached, for both games. Both receipts were accepted and the complete integration passed in 33.9 seconds. This reported source edge did not reproduce: explicit JSON submission bypasses the generated-action pending guard. No production guard was relaxed.
