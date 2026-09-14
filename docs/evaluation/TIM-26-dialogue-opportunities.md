# TIM-26 — fair, deadline-aware house dialogue opportunities

## Review outcome

The bounded scheduler correction is ready for review against baseline `f802335`
(integrated TIM-7 diagnostic `534e56f`). In the 100-phase, all-house Succession
fixture, initial coverage rises from **136/340 to 340/340 eligible seat-windows**.
With concurrent one-second generation, all 340 first opportunities and 340
follow-ups succeed. Default phase clocks, inference ceilings, reservation limits,
and prompts are unchanged.

**This is conditional opportunity fairness, not unconditional full-match dialogue
or affordability.** The real coordinator denies some follow-ups at its rolling
limit. Combined wakeup/generation delay removes 93 follow-ups from this sample.
The four-bytes-per-token charge fits 100 phases but interrupts a longer run at
phase 121 when a mandatory reservation cannot fit alongside in-flight estimates.
These are measured tradeoffs for TIM-14 review, not successful activations.

All work is local, with loopback synthetic inference and OS-assigned ports. No
paid inference, deployment, push, Linear mutation, or package/lockfile change.

## Production change

- `src/server/match.ts`: give every eligible living house participant an initial
  slot. Rank the living discussion participants clockwise from the current
  anchor; use compact rank rather than absolute seat number or distance cutoffs.
  Initial starts fit into the first second at normal speed. Preserve cooldown
  carried across phases. Offer a second slot after accepted speech followed by
  peer speech, using the existing generation/phase/seat `chat:0` and `chat:1` IDs.
- `src/server/house-contract.ts`: optional paid inference needs at least **1,150
  ms of job slack**: one second of usable generation plus the existing 150 ms
  timeout allowance. Scripted preview has no provider-generation allowance.
- `src/server/house-seat.ts`: enforce the minimum at enqueue, before observation,
  and after reservation; recheck current cooldown before inference. Persist
  `outcome` and `completed_at` in SQLite, migrating existing job tables additively.
  Record explicit admission, insufficient-time, expired, obsolete, closed-chat,
  provider-error, and rejected outcomes, separately from acceptance and silence.
  Late optional outbox work reaches the runner so it can record its outcome.

The two-slot cap includes silent responses and skips; neither creates a third
slot. It is a cap on **durable logical jobs**, with the existing provider retry
policy (up to two attempts per job) retained. Recovery and saved-response replay
retain job IDs and receipt IDs. Required jobs keep their existing earliest-due
priority within a house runner and the coordinator's higher rolling-call limit.
There is no preemption of an already-running optional inference call, nor a new
reservation for future mandatory work.

Skip logs contain job identity, outcome, time, and deadline, not role, prompt,
private response, or notes. `due_at` records a deferred cooldown. Existing rows
may have null outcome/timestamp until processed; `INSERT OR IGNORE` preserves
already-completed work.

## Feedback loop and test definition

The original opening command was red before production edits:

```sh
TIM7_NAME=tim26-before npx vitest run --config vitest.dialogue-baseline.config.ts
```

It failed in 1.58 seconds: seats `[3,4,5,6,7,8]` never activated and speakers
`[1,2]` received no follow-up. The first fair scheduler made the opening green.
The full run then exposed 39 reservation refusals and four unexplained lost
follow-ups. Durable skip regressions were red before outcome recording. A
separate real-runner cooldown test was red (`2` submissions before cooldown,
expected `1`) before the runner recheck; both shared-game tests now pass.

Assertions use actual native SQLite jobs, provider HTTP requests, accepted
submissions, public events, and entitled observations, not a duplicate scheduler
formula. They check:

- Healthy fixtures retain **every initial activation** and reach the requested
  checkpoint or a real engine finish; an early interruption cannot pass vacuously.
- Each admitted chat reservation has at least 1,150 ms of remaining job time.
- At most two logical optional jobs exist per eligible seat/phase, including
  silent responses and skips. The silent control requires exactly one null
  response per eligible seat-window and no accepted chats.
- A requested but missing activation needs a matching durable admission refusal
  or provably insufficient time using deadline, completion time, and `due_at`.
  The old TIM-7 peer/cooldown/500-ms engine-window screen is retained as a broad
  diagnostic; it deliberately flags more follow-ups than the new usable budget
  permits. It includes external public speech and event order for equal times.
- The all-house one-second-generation/no-wakeup-lag case additionally requires
  every screened follow-up, with **no skip exemption**. Mixed-controller and
  wakeup-delay runs expose their measured shortfalls separately.
- Every generated request correlates to its own seat/time context read, so
  admission retries and concurrent response order cannot misassociate prompts.
- Latest available entitled chat is present in both recent history and the
  actual provider prompt; every accepted public chat is in paged spectator
  history, whose cursor agrees with the live WebSocket head.

`TIM7_REPORT_ONLY=1` retains evidence collection and core context/delivery checks;
it disables the original missing-opportunity classification gates. Final healthy
runs below do **not** use it. Budget controls explicitly expect interruption and
assert the unchanged $1.50 ceiling, rather than hiding the incomplete match.

## Before/after results

Default seed 7, normal snapshot timing. “Follow-ups” below means **accepted
second utterances**, not offered jobs. All rows have zero rejected submissions.
Sequential means immediate provider completion; it does not model concurrency.

| Case | Phases | Initial Act I / Act II | Follow-ups I / II | Chats / all calls | Explicit chat skips | Virtual ms |
| --- | ---: | --- | --- | --- | --- | ---: |
| Baseline + real coordinator | 100 | 76/190; 60/150 | 38; 26 | 200 / 450 | 0 (scheduler absence) | 595,098 |
| Fair, sequential | 100 | 190/190; 150/150 | 190; 140 | 670 / 920 | 4 admission; 6 time | 595,098 |
| Generation +1,000 ms, concurrent | 100 | 190/190; 150/150 | 190; 150 | 680 / 930 | 0 | 661,098 |
| Wakeup +1,000 ms, immediate generation | 100 | 190/190; 150/150 | 190; 136 | 666 / 916 | 14 time | 661,098 |
| Both +1,000 ms | 100 | 190/190; 150/150 | 190; 57 | 587 / 837 | 93 time | 727,098 |
| Four house/six external, seed 3, generation +1,000 ms | 100 | 64/64; 76/76 | 64; 61 | 265 / 376 | 15 time | 596,072 |
| Through sparse-table finish, sequential | 178 | 190/190; 298/298 | 190; 286 | 964 / 1,356 | 4 admission; 8 time | 805,191 |

The four admission-lost follow-ups remain visible in the sequential full run.
Six additional offered second slots arrive too late for the usable budget and
are explicitly skipped, even though they fall outside the old broad wanted set.

Opening seed 7: 10/10 first activations, ten follow-ups, 20 chats, 20,000 ms
unchanged duration. Seed 1 rotates the opening anchor from seat 9 to seat 3 with
the same coverage. The 100-phase run visits all ten anchors. Initial normal-speed
starts are at most 900 ms after opening. The final two-player discussion has
living seats `[2,9]`, anchor 9: both receive first and second utterances. Dead
holes no longer consume pacing slots. Mixed controllers are shuffled by the
real engine and external required actions and public speech use real submission
APIs, rather than converting external seats to house seats.

Silent opening: ten activations, ten null responses, no chat or follow-up. This
demonstrates opportunity without forcing speech. The original game's real
scripted opening also gives all ten seats two accepted utterances, starting with
the coordinator.

### Slack and duration

Minimum **actual admitted job slack** across the 100-phase sample:

| Case | Slack ms | Usable generation after 150-ms allowance |
| --- | ---: | ---: |
| Baseline | 500 | 350 |
| Fair sequential | 3,600 | 3,450 |
| Generation delay | 1,497 | 1,347 |
| Wakeup delay | 1,201 | 1,051 |
| Combined delay | 1,200 | 1,050 |
| Mixed controller | 1,204 | 1,054 |

Generation-delayed successful activations measure exactly 1,000 ms from captured
context read to job completion. The separate wakeup-lag variable delays house
alarm starts, including required actions. Required actions complete sooner or
later with these controls, explaining the 66,000-ms sample-duration changes;
discussion deadlines and game timing constants were not extended. The existing
legal long-path suite still measures Act II at **15,599,520 ms (4h19m59.520s)**.

## Real reservation and cost measurement

`DialogueCoordinator` now subclasses the actual `MatchmakingObject`, exercising
`PlatformQueue.reserveInference`, `recordInference`, native usage/allocation
tables, and `inferenceSummary`. It seeds one already-admitted allocation with
the real snapshot and external grants. Real match admission, D1 indexing, rating
settlement, other matches, and daily-budget background cleanup remain outside
this isolated driver. The reservation is **$1.50**, daily budget **$5**, optional
rolling threshold **180**, mandatory threshold **250**, all unchanged.

The coordinator has no separate inference-concurrency limiter. Peak concurrency
below is measured as simultaneous unfinished usage reservations, and overlaps
correspond to genuinely held HTTP responses.

| Case | Peak rolling RPM | Peak concurrent | Reservation refusals | Sum of conservative admitted estimates, USD |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 106 | 1 | 0 | 2.7184444 |
| Fair sequential | 186 | 1 | 39 | 5.1438276 |
| Generation delay | 160 | 10 | 0 | 5.2039464 |
| Wakeup delay | 159 | 1 | 0 | 5.1219952 |
| Combined delay | 115 | 10 | 0 | 4.6922428 |
| Mixed controller | 64 | 4 | 0 | 1.9962364 |
| Sparse finish | 186 | 1 | 42 | 7.7933660 |

RPM includes mandatory work, which can exceed the optional threshold. Refusals
include bounded retries, not just distinct skipped jobs. The sum of estimates
is not final spend: successful calls release excess reservation when actual
synthetic token usage is recorded. A 20-chat opening versus the baseline's six
is 3.33x chat calls. The 100-phase one-second-generation run is 680 versus 200
chat calls (3.40x), and 930 versus 450 total calls (2.07x), before provider retries.

Three charge modes use the same real accounting and pricing function:

1. `fixture`: existing deterministic 100-input/20-output usage, useful only for
   scheduler isolation. Full concurrent sample accounts $0.06696. This is **not
   a real-model cost estimate**.
2. `estimated`: input bytes / 4 and generated JSON bytes / 4, rounded up. Full
   concurrent 100-phase sample accounts **$1.1965112**. Extending to 200 requested
   phases interrupts at **phase 121**, 1,120 calls, 800 accepted chats, 400/400
   initial opportunities, $1.461404 settled usage. One mandatory reservation is
   refused while other calls retain conservative estimates: **$1.4989136** is
   accounted at refusal, and the requested estimate is **$0.0060672**. The request would
   fit the final settled balance, but the existing coordinator returns the job
   deadline and the runner does not retry that budget refusal.
3. `ceiling`: one input token per UTF-8 byte and 512 output tokens. The 100-phase
   request interrupts at **phase 34**, 293 calls, **$1.4998828**, 116/120 initial
   opportunities, 227 accepted chats. Nine chat jobs record admission skips;
   there are ten total reservation refusals including mandatory work.

Thus even the milder synthetic estimate does not fund the complete game. This
patch preserves the budgets and exposes the tradeoff. Choosing affordability
policy, retrying transient reservation pressure, protecting future mandatory
work, or limiting aggregate optional demand needs explicit TIM-14 follow-up.

## Concurrency fixture and evidence boundaries

The driver advances a deterministic clock and starts real house alarms via RPC.
The loopback provider holds real Responses API HTTP requests. A control endpoint
releases all completions due at the current virtual time together. The driver
awaits the actual alarm work promise before moving past a released completion;
it does not serialize requests until after their due response time. This models
overlapping inference separately from house wakeup delay. One alarm runs per
seat, matching the platform's documented alarm guarantee.

Final concurrent full sample: 930 prompt reads, zero latest-context misses,
maximum user prompt 10,180 bytes, 680 delivered chats, 781 socket frames, and
socket/history head 871 across 28 pages. The mixed run also delivers all 210
external messages (475 public chats total). Raw traces contain phase eligibility,
offered jobs, terminal outcomes, reservations, provider bodies, captured context,
submissions, events, frames, and history pages in ignored `.tim7/` directories.

This does not measure model willingness/quality, production network jitter,
multi-match admission contention, real tokenization, or React rendering. Context
freshness is checked at each read; a prompt already in flight cannot contain
speech accepted after that read. Deterministic game random choices do not seed
commitment salts/visibility epochs; raw hashes are not determinism criteria.

## Reproduction and check ledger

Run from `/tmp/opencode/agent-game-TIM-26` with the installed dependencies.
For every matrix row, the command is:

```sh
<environment below> npx vitest run --config vitest.dialogue-baseline.config.ts
```

`TIM7_NAME` selects `.tim7/<name>/trace.json` and `summary.json`; retained naming
keeps the TIM-7 feedback command usable. All rows below passed one test.

| TIM7_NAME | Additional environment | Measured suite seconds |
| --- | --- | ---: |
| tim26-budget-before | TIM7_REPORT_ONLY=1 TIM7_PHASES=100 | 10.63 |
| tim26-final-opening | none | 2.14 |
| tim26-final-full | TIM7_PHASES=100 | 22.36 |
| tim26-final-generation | TIM7_PHASES=100 TIM26_LATENCY=1000 | 28.97 |
| tim26-final-wakeup | TIM7_PHASES=100 TIM7_LAG=1000 | 23.44 |
| tim26-final-combined | TIM7_PHASES=100 TIM7_LAG=1000 TIM26_LATENCY=1000 | 24.24 |
| tim26-final-silent | TIM7_SILENT=1 | 1.92 |
| tim26-final-seed1 | TIM26_SEED=1 | 2.19 |
| tim26-final-mixed | TIM7_PHASES=100 TIM26_HOUSES=4 TIM26_SEED=3 TIM26_LATENCY=1000 | 14.67 |
| tim26-final-sparse | TIM7_PHASES=200 | 35.48 |
| tim26-final-estimated | TIM7_PHASES=100 TIM26_LATENCY=1000 TIM26_USAGE=estimated | 29.67 |
| tim26-final-ceiling | TIM7_PHASES=100 TIM26_LATENCY=1000 TIM26_USAGE=ceiling | 10.58 |
| tim26-estimated-completion | TIM7_PHASES=200 TIM26_LATENCY=1000 TIM26_USAGE=estimated TIM26_EXPECT_INTERRUPTED=1 | 34.39 |

Earlier successful loop iterations used names `tim26-fair-opening`,
`tim26-budget-green`, `tim26-concurrent-opening`, `tim26-concurrent-full`,
`tim26-concurrent-full2`, `tim26-wakeup-full`, `tim26-combined-full`, `tim26-mixed`,
`tim26-mixed-full`, `tim26-sparse`, `tim26-estimated`, and `tim26-ceiling`, with the
corresponding matrix parameters. Their logs and artifacts are retained.

Red iterations and corrections:

- `tim26-fair-full`: first failed the old sequential context-read/provider-count
  assumption (959 reads, 920 calls); after explicit reservation correlation it
  failed the four absent follow-ups. `tim26-skip-red` retained that regression
  before durable outcomes. Both led to the passing full run above.
- `npx vitest run tests/dialogue-shared.test.ts`: cooldown red in 2.17 seconds;
  two tests green in 2.21 seconds after the runner recheck. The earlier original-
  game-only test also passed in 2.08 seconds.
- Mixed full briefly failed an added zero-follow-up-loss assertion. Its 15
  insufficient-time skips are real. That stronger assertion is now explicitly
  scoped to the all-house generation-only control; mixed first coverage remains
  unconditional and every mixed missing follow-up needs a verified skip.
- The longer estimated run twice exposed an overly eager 500-poll completion
  barrier in the diagnostic (27.67/26.99 seconds). Replacing polling with awaiting
  the actual alarm promise produced the measured phase-121 interruption above.
- `npm run test:provider`: first failed three tests on harmless local `GET /`
  discovery probes (298.57 seconds). After extending the fixture's health route,
  the two failure-mode tests passed; the success test exposed its stale once-per-
  match speech assumption (298.82 seconds). It now opts into once-per-act fixture
  speech, keeping the actual Act II context assertion intact.
- The once-per-act provider run passed both failure-mode tests but found 660
  usage reservations versus 652 HTTP calls (303.32 seconds). Eight reservations
  had been released at zero cost by the post-reservation time check. The test now
  requires each such difference to match a completed, zero-attempt optional job
  with `insufficient-time` and less than 1,150 ms slack; measured provider cost
  and unknown-usage assertions remain intact.

Additional verification commands:

- `npm run build` — passed; packaged CLI and Vite production build.
- `npx vitest run tests/platform-queue.test.ts tests/house-model.test.ts tests/succession-ui-stream.test.ts tests/succession-long-path.test.ts`
  — passed, including unchanged legal long-path duration and mixed mandatory
  budget bypass/all-house ceiling tests.
- `npx vitest run tests/succession-worker.test.ts tests/succession-worker-bounds.test.ts`
  — **7 passed**, 175.56 seconds: actual SQL/restart/recovery, takeover/privacy,
  bounded current/history, sockets and 31,200-message archives.
- `npm run typecheck` and `npx tsc --noEmit` — passed during implementation.
  Two intermediate fixture typing errors (`request.url` and JSON response type)
  were fixed and rechecked.
- Scoped `npx oxlint` and `npx prettier --write` — passed after fixing initial
  readable-spacing/literal-ternary violations.

Final snapshot rechecks after the awaitable-completion driver and expanded metrics:

- `TIM7_NAME=tim26-reviewed-opening` — one dialogue test passed, 2.60 seconds.
- `TIM7_NAME=tim26-reviewed-full TIM7_PHASES=100` — one passed, 25.32 seconds.
- `TIM7_NAME=tim26-reviewed-generation TIM7_PHASES=100 TIM26_LATENCY=1000` — one
  passed, 33.06 seconds; same coverage, calls, slack, and duration as above.
- `TIM7_NAME=tim26-reviewed-budget TIM7_PHASES=200 TIM26_LATENCY=1000 TIM26_USAGE=estimated TIM26_EXPECT_INTERRUPTED=1`
  — one passed, 36.02 seconds; captures the accounted balance at refusal above.
- `npm run typecheck` — passed.
- `npx vitest run tests/dialogue-shared.test.ts tests/platform-queue.test.ts tests/house-model.test.ts tests/succession-ui-stream.test.ts tests/succession-long-path.test.ts`
  — **22 passed**, 2.78 seconds.
- `npm run test:provider` — **3 passed**, 329.06 seconds, including its dedicated
  TypeScript configuration. The actual-provider success fixture completes both
  acts, 693 HTTP calls, 1,185 events/30 history pages, peak rolling RPM 218, one
  intentionally unknown-usage failure, and $0.049824 synthetic measured usage.
  It verifies required-choice execution, sealed/private history, stale generation,
  saved-response retry, a single receipt, duplicate enqueue, and zero-cost
  post-reservation deadline skips. Invalid and timeout interruption controls pass.
- `npx oxlint` on all ten changed TypeScript files — zero warnings/errors.
- `npx prettier --check` on the eleven changed TypeScript/JSONC files — passed.
  Evaluation Markdown is excluded by the repository's existing Prettier ignore.
- `git diff --check` and `git diff --cached --check` — passed.

### Changed files

Production: `src/server/match.ts`, `src/server/house-seat.ts`, and
`src/server/house-contract.ts`.

Regression/evidence tooling: `tests/dialogue-baseline.integration.ts`,
`tests/dialogue-baseline.wrangler.jsonc`, `tests/fixtures/dialogue-baseline-worker.ts`,
`tests/fixtures/dialogue-baseline-report.ts`, `tests/dialogue-shared.test.ts`,
`tests/succession-provider-server.ts`, `tests/succession-provider.integration.ts`,
and `fixtures/succession-provider-worker.ts`.

Report: `docs/evaluation/TIM-26-dialogue-opportunities.md` (this file). Ignored
`.tim7/` artifacts remain in the worktree for the parent's evidence/cleanup workflow.

Local workerd shutdown occasionally prints `Broken pipe`; existing restart tests
also emit their fixture's missing-assets discovery response. These did not fail
the passing transport/history assertions. The provider delivery-fault exception
is intentional and verifies saved-response replay without another inference.

Relevant platform references checked: [alarms](https://developers.cloudflare.com/durable-objects/api/alarms/),
[SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/),
and [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
