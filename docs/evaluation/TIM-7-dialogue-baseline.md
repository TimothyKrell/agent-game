# TIM-7: reproducible dialogue opportunity baseline

**Diagnosis baseline:** `c74b915f427def75681ed0c8f323c75768914e1c`, branch
`diagnosis/tim-7-dialogue-baseline`. Measured 2026-09-14. This is first-batch
diagnostic evidence and a proposed TIM-14 split, not a production fix.

## Findings

1. **The house scheduler demonstrably restricts conversation opportunity.** In
   the 100-phase local trace, 34 discussion windows offered 340 eligible
   seat-windows; only 136 (40%) received an initial activation. An always-speaking
   provider cannot make the other 204 speak. This reproduces the breadth symptom
   without depending on model behavior or UI rendering.
2. **Act II has less usable reply capacity.** The 19 Act I discussions each
   produce four initial and two follow-up messages. The first 15 Act II
   discussions produce four initial messages each but only 26 follow-ups in
   total. Absolute-seat staggering leaves seat 8's second activation just 500 ms
   before its job deadline. Seat 9's second slot meets the deadline exactly and
   is not inserted. A 1,000 ms house-wakeup delay reduces Act II accepted
   follow-ups from 26 to 15.
3. **Sparse late-game tables do not solve the restriction.** A separate bounded
   run completes the actual game in 178 phases. Its final two-seat discussion
   has eligible seats `[2,9]`, both speak once, and neither receives a follow-up.
   Seat 2 could reply after the peer message and cooldown, but is outside the
   follow-up selection. Dead positions still consume clockwise distance.
4. **The real house context and delivery paths work in this fixture.** All 450
   activations in the 100-phase run receive the latest chat through entitled
   recent history and the actual provider prompt. All 200 generated chats are
   accepted and recovered through real paged history; the spectator WebSocket
   reaches the same public head. This does **not** establish real-model response
   quality or prove React displays every accepted message during backlog.

## Reproduce

Run from this checkout with Node 22.12+ and the locked dependencies installed.
This worktree used `npm ci --cache .npm-cache --no-audit --no-fund`.
No credential setup, Cloudflare account, application build, D1 migration, or
listening dev server is needed. The Worker, inspector and provider use OS-assigned
ports (`port: 0`), avoiding 8787/8798 and other sessions' fixed ports. The config
contains no Workers AI or remote binding; the OpenAI client is pointed at a
loopback HTTP fixture with a deliberately unusable key.

### Tight red-capable command

```sh
TIM7_NAME=opening npx vitest run --config vitest.dialogue-baseline.config.ts
```

Measured output, condensed (exit **1**, expected at the baseline):

```text
phases=1 virtualMs=20000 calls=6 chatCalls=6 acceptedChat=6
eligible=[0,1,2,3,4,5,6,7,8,9]
initial=[0,1,2,9] followup=[0,9]
FAIL Eligible seats received no speaking activation: [3,4,5,6,7,8]
FAIL A peer replied while there was time, but the speaker got no follow-up: [1,2]
rejected=0 silent=0 doneWithoutResponse=0
recentMissingLatest=0 promptMissingRecentLatest=0
socketHead=10 deliveredHead=10 deliveredChats=6
```

The measured command took approximately **1.7 seconds** including startup; the
test itself took 0.8 seconds. It was repeated with the same verdict. This is a
candidate dialogue acceptance bar, not an assertion that the current rules
promise a house activation to every legal speaker. It tests **executed provider
activations and accepted messages**, rather than reproducing a distance formula.
Both assertions remain enabled by default; the separate diagnostic config keeps
an intentionally red baseline out of `npm test`.

The follow-up assertion observes a peer message after a seat's first accepted
message and asks for a second activation when the five-second cooldown plus a
500 ms response budget fits strictly before the **engine** phase deadline.
It is deliberately independent of the scheduler's seat cutoffs and job IDs.
The 500 ms budget is a diagnostic minimum, not a measured model SLA. The report
also records opportunities for a further reply after an already accepted second
message; that is evidence about the one-shot cap, not another default assertion.

### Measurement commands

Run these sequentially for comparable wall-clock timings:

```sh
TIM7_REPORT_ONLY=1 TIM7_NAME=full TIM7_PHASES=100 npx vitest run --config vitest.dialogue-baseline.config.ts
TIM7_REPORT_ONLY=1 TIM7_NAME=repeat TIM7_PHASES=100 npx vitest run --config vitest.dialogue-baseline.config.ts
TIM7_REPORT_ONLY=1 TIM7_NAME=lag1000 TIM7_PHASES=100 TIM7_LAG=1000 npx vitest run --config vitest.dialogue-baseline.config.ts
TIM7_REPORT_ONLY=1 TIM7_NAME=silent TIM7_SILENT=1 npx vitest run --config vitest.dialogue-baseline.config.ts
TIM7_REPORT_ONLY=1 TIM7_NAME=sparse TIM7_PHASES=200 npx vitest run --config vitest.dialogue-baseline.config.ts
```

These five measurement runs exit **0**. `TIM7_REPORT_ONLY=1` suppresses the two
proposed opportunity assertions; provider/context association, WebSocket head
delivery, history cursor continuity, and accepted-message/history correlation
remain checked. It does not mean the dialogue symptom is fixed.

Artifacts are written under ignored `.tim7/<TIM7_NAME>/`:

- `summary.json`: phase/act/seat coverage, first and follow-up jobs, silence,
  expirations, activation time/slack samples, context freshness, delivery totals.
- `trace.json`: actual outbox jobs, completed house rows/responses, context reads,
  submission results, entitled provider request bodies, spectator observations,
  event keys and history page boundaries. These contain **synthetic** private
  game data, not credentials or real-player content.

The initial, repeat and final 100-phase `summary.json` files were byte-identical.
The fixture's commitment salt/epoch is intentionally not seeded;
raw trace hashes are not a determinism criterion. Game randomness and IDs are
seeded, so the deal, gameplay, metrics, phase IDs and relative times repeat.
The 100-phase run takes roughly 8–11 seconds locally, the completed-game run
roughly 14 seconds; wall time varies with machine load.

## What actually runs

```text
MatchObject.initialize → createGame / real seeded Succession engine
  → real save / enqueueWork → native SQLite outbox
  → MatchObject.alarm → real RPC HouseSeatObject.enqueue
  → HouseSeatObject.alarm → MatchObject.houseObservation
  → observeGame + MatchHistory.recent → housePrompt / houseSystem
  → generateHouse / Effect / OpenAI Responses HTTP client
  → loopback structured-response fixture → real response decoder
  → MatchObject.submitHouse → validation / receipts / engine / SQLite
  → broadcast → real spectator WebSocket
  → historyPage over HTTP → actual SuccessionHistory reader
```

All game transitions arise from initialization, real discussion deadlines, and
provider-selected legal actions. No phase, card, resource, participant, timing,
production prompt, or scheduling rule is patched. The fixture seeds the existing
randomness interface, retains the descriptor's normal clocks, and uses ten
original house seats. Its seed is 7 and clock origin is 1,800,000,000,000 ms.

**Isolated substitutions and limits:**

- The test-only Worker replaces `Date.now` and captures each object's
  `setAlarm`/`deleteAlarm`. One deterministic driver invokes the real alarms in
  due-time order, with seat-number ordering for ties. It serializes provider
  completions. No actual elapsed 20-/30-/10-second wait occurs. This is a local
  scheduler replay, not evidence about Cloudflare distributed alarm jitter,
  hibernation, concurrent inference, eviction, or real provider latency.
- The provider fixture always returns a valid, short message referencing the
  newest other-seat chat it received, or returns null in the silence control.
  Required moves use the existing seat-entitled fixture policy. Its output is
  a **context transport witness**, not an evaluation of an LLM's understanding.
- Match outbox dispatch, house job storage, receipts, context, validation,
  prompts, schemas, HTTP generation and history remain real. Admission/budget
  coordination is replaced with unconditional permits. D1 indexing and rating
  settlement are excluded; a terminal engine result is not a settlement test.
  No paid inference, production write, or Linear mutation occurs.
- `TIM7_LAG` delays each house alarm's wake-up, including mandatory action work;
  it is **not** a simulation of provider latency. The match alarm remains timely.
  Zero-lag generation consumes zero virtual milliseconds, though the actual
  local HTTP request consumes wall time. In particular, a 500 ms virtual slack
  result does not demonstrate that a production model can reliably meet it.
- The driver supports one local match per Worker run and at most 200 phases.
  Persistence is explicitly disabled. The global clock/seed and fixture routes
  must not be copied into a production entrypoint. Loopback `GET /` discovery
  probes are answered without counting them as inference.
- Some local workerd runs print a `Broken pipe` diagnostic during shutdown.
  The final head/history checks still pass and the repeated summaries match;
  this was not counted as a production delivery failure.

## Measured coverage

An **eligible seat-window** means a living seat returned by the real
`inspectGame(...).discussion.seats` for one discussion phase. An **activation**
means the house runner obtained a provider response, including deliberate
silence. A **follow-up** in the tables is an inserted `chat:1` job; under zero lag
all these jobs generate accepted messages. Mandatory phases have no discussion
entitlement and are retained in the raw phase trace but excluded from these
denominators.

### Main 100-phase run

| Measure                              | Act I | Act II | Total |
| ------------------------------------ | ----: | -----: | ----: |
| Discussion windows                   |    19 |     15 |    34 |
| Eligible seat-windows                |   190 |    150 |   340 |
| Activated seat-windows               |    76 |     60 |   136 |
| First activation coverage            |   40% |    40% |   40% |
| Follow-up jobs / accepted follow-ups |    38 |     26 |    64 |
| Accepted chats                       |   114 |     86 |   200 |

There are 450 total provider calls: 250 required moves and 200 chat calls, all
with successful submissions. Virtual elapsed time is **595,098 ms**. The trace
includes all of Act I, all ten actor anchors in Act II round 1, and the first five
actor anchors of round 2, stopping after phase 100. All ten seats are alive in
these 34 discussions; all ten receive at least one first activation across each
act. This is per-phase exclusion and uneven access, not permanent exclusion of
six fixed agents for the entire match.

Per-seat **eligible / activated / follow-up** counts:

| Seat | Act I       | Act II     |
| ---: | ----------- | ---------- |
|    0 | 19 / 7 / 7  | 15 / 8 / 4 |
|    1 | 19 / 9 / 6  | 15 / 8 / 4 |
|    2 | 19 / 11 / 4 | 15 / 7 / 3 |
|    3 | 19 / 10 / 4 | 15 / 6 / 2 |
|    4 | 19 / 9 / 5  | 15 / 5 / 2 |
|    5 | 19 / 10 / 6 | 15 / 4 / 2 |
|    6 | 19 / 8 / 3  | 15 / 4 / 2 |
|    7 | 19 / 6 / 0  | 15 / 5 / 3 |
|    8 | 19 / 3 / 0  | 15 / 6 / 4 |
|    9 | 19 / 3 / 3  | 15 / 7 / 0 |

Act I phase coverage (`N` nomination discussion, `G` government discussion,
`E` executive discussion). Each named phase has ten eligible seats and six
accepted messages; sets below are identical within each row:

| Election round | Phases  | Anchor | First seats | Follow-up seats |
| -------------: | ------- | -----: | ----------- | --------------- |
|              1 | N, G, E |      9 | 0,1,2,9     | 0,9             |
|              2 | N, G    |      0 | 0,1,2,3     | 0,1             |
|              3 | N, G    |      1 | 1,2,3,4     | 1,2             |
|              4 | N, G    |      2 | 2,3,4,5     | 2,3             |
|              5 | N, G    |      3 | 3,4,5,6     | 3,4             |
|              6 | N, G, E |      4 | 4,5,6,7     | 4,5             |
|              7 | N, G, E |      5 | 5,6,7,8     | 5,6             |
|              8 | N, G    |      0 | 0,1,2,3     | 0,1             |

Act II `act-2:discussion` coverage. All ten seats are eligible in every listed
window. Round 1 actor order is `7,8,9,0,1,2,3,4,5,6`; round 2 repeats through
anchor 1 in this bounded trace:

| Anchor | Sampled rounds | First seats | Follow-up seats | Accepted per window |
| -----: | -------------- | ----------- | --------------- | ------------------: |
|      0 | 1,2            | 0,1,2,3     | 0,1             |                   6 |
|      1 | 1,2            | 1,2,3,4     | 1,2             |                   6 |
|      2 | 1              | 2,3,4,5     | 2,3             |                   6 |
|      3 | 1              | 3,4,5,6     | 3,4             |                   6 |
|      4 | 1              | 4,5,6,7     | 4,5             |                   6 |
|      5 | 1              | 5,6,7,8     | 5,6             |                   6 |
|      6 | 1              | 6,7,8,9     | 6,7             |                   6 |
|      7 | 1,2            | 0,7,8,9     | 7,8             |                   6 |
|      8 | 1,2            | 0,1,8,9     | 8               |                   5 |
|      9 | 1,2            | 0,1,2,9     | 0               |                   5 |

### Latency and deadline slack

All generated responses take **0 virtual ms** from context read to accepted
submission in the zero-lag run. These are measured fixture values, not LLM
latency estimates. Initial dispatch is ordinarily at its due time; seat 0's
immediate slot starts at +2 ms after match-outbox and house-alarm dispatch.

| Representative phase / seat         | First context at | Follow-up context at |  Job slack at follow-up | Actual phase slack after acceptance |
| ----------------------------------- | ---------------: | -------------------: | ----------------------: | ----------------------------------: |
| Act I nomination, anchor 9 / seat 0 |            +2 ms |            +5,002 ms |               14,498 ms |                           14,998 ms |
| Act I nomination, anchor 9 / seat 9 |        +4,500 ms |            +9,500 ms |               10,000 ms |                           10,500 ms |
| Act II, anchor 0 / seat 0           |            +2 ms |            +5,002 ms |                4,498 ms |                            4,998 ms |
| Act II, anchor 7 / seat 7           |        +3,500 ms |            +8,500 ms |                1,000 ms |                            1,500 ms |
| Act II, anchor 7 or 8 / seat 8      |        +4,000 ms |            +9,000 ms |                  500 ms |                            1,000 ms |
| Act II, anchor 8 or 9 / seat 9      |        +4,500 ms |     **not inserted** | would be 0 ms at +9,500 |                                   — |

The provider wrapper subtracts another 150 ms from job slack when establishing
its timeout (`house-model.ts:277–317`). Thus seat 8's nominal 500 ms becomes at
most 350 ms for real generation, even before other overhead. In Act I opening
discussion seat 0 receives a peer's later message after its second message and
has ample time for a third activation; none appears. `chat:0` and `chat:1` are
durable one-shot identities, not a continually refreshed conversation loop.

### Silence and delay controls

| Case                                | Chat calls | Accepted | Silence responses | Done without response | Pending chats at stop |
| ----------------------------------- | ---------: | -------: | ----------------: | --------------------: | --------------------: |
| Opening, always reply               |          6 |        6 |                 0 |                     0 |                     0 |
| Opening, always silent              |          4 |        0 |                 4 |                     0 |                     0 |
| 100 phases, zero lag                |        200 |      200 |                 0 |                     0 |                     0 |
| 100 phases, +1,000 ms house wakeups |        189 |      189 |                 0 |                     4 |                     0 |

There are **zero rejected submissions** in these cases. In the lag run all four
done-without-response jobs have `attempts=0` and recorded completion times at or
after their deadline: they expire before provider invocation. Act I retains
114 chats. Act II falls from 86 to 75: seven follow-up jobs are no longer inserted
and four inserted jobs expire. The change is in opportunity/dispatch, not model
silence or rejection. The lag run lasts 661,098 virtual ms because mandatory
house activations are also delayed; it is not an experiment increasing phase
durations. Full job IDs, deadlines and completion times are in `summary.drops`.

### Sparse-table extension (200-phase bound, finishes at 178)

This is the same seeded policy continued through real eliminations, not a
manually edited board. The engine finishes with seat 2 surviving at **805,191
virtual ms**. Act II totals: **36** discussion windows, **298** eligible
seat-windows, **129** first activations (43.3%), **59** follow-ups, **188** chats.
Across both acts: 694 provider calls, 302 accepted chats, zero silence,
rejections, or done-without-response jobs. Every latest chat remains in the
sampled house context and prompt. No rating settlement is exercised.

Act II per-seat `eligible / activated / follow-up`:

```text
0:25/12/6  1:26/12/6  2:36/15/7  3:33/14/8  4:29/12/6
5:34/15/7  6:35/15/8  7:21/9/5   8:23/10/6  9:36/15/0
```

All additional full-table windows follow the anchor table above. Every
reduced-table discussion is listed here:

| Round / anchor | Eligible seats    | First seats | Follow-up seats |
| -------------- | ----------------- | ----------- | --------------- |
| 3 / 8          | 0,1,2,3,4,5,6,8,9 | 0,1,8,9     | 8               |
| 3 / 9          | 0,1,2,3,4,5,6,8,9 | 0,1,2,9     | 0               |
| 3 / 0          | 0,1,2,3,4,5,6,9   | 0,1,2,3     | 0,1             |
| 3 / 1          | 0,1,2,3,4,5,6,9   | 1,2,3,4     | 1,2             |
| 3 / 2          | 1,2,3,4,5,6,9     | 2,3,4,5     | 2,3             |
| 3 / 3          | 2,3,4,5,6,9       | 3,4,5,6     | 3,4             |
| 3 / 4          | 2,3,4,5,6,9       | 4,5,6       | 4,5             |
| 3 / 5          | 2,3,4,5,6,9       | 5,6         | 5,6             |
| 3 / 6          | 2,3,5,6,9         | 6,9         | 6               |
| 4 / 9          | 2,3,5,6,9         | 2,9         | —               |
| 4 / 2          | 2,3,5,6,9         | 2,3,5       | 2,3             |
| 4 / 3          | 2,3,5,6,9         | 3,5,6       | 3               |
| 4 / 5          | 2,5,6,9           | 5,6         | 5,6             |
| 4 / 6          | 2,6,9             | 6,9         | 6               |
| 5 / 9          | 2,9               | 2,9         | —               |

## Fresh context and UI delivery

In the main trace, all **450** house reads associate one-to-one, in order, with
HTTP provider requests from the same seat. For every read, the latest chat's
seat/time matches the newest entitled recent chat, and that chat's seat/text is
present in the provider's actual JSON prompt. No latest-chat loss occurs;
maximum user-prompt size is **12,049 bytes** (below the 19,000-byte prompt ceiling).
Earlier history is intentionally bounded: `MatchHistory.recent` reads the last
64 entitled events; `housePrompt` retains at most 25 chats and then removes oldest
chat first when enforcing its byte ceiling. This fixture does not fill those
budgets with maximal-length Unicode messages or model notes.

Real spectator transport for the main trace:

```text
301 observation frames
socket public streamHead = 391
history delivered cursor = 391, in 13 real pages
200 accepted chats = 200 delivered chat events
first page cursor = 32; largest page = 7,487 bytes
```

The current observation announces availability, not the text itself. The test
opens the socket before play, then deliberately performs a finite history walk
using the actual `SuccessionHistory` client after the run. Each accepted chat is
matched to a delivered event by seat, text and timestamp; event keys verify page
identity/continuity. The opening trace has only ten public events and fits one
page. A late reader of the main trace still has **359 events outstanding after
its first 32-event page**. The completed sparse run reaches terminal archive
head 1,554 in 49 pages; terminal visibility expands, so this is not comparable
to a live public head as if both were the same stream epoch.

`use-succession-match.ts:145–161` automatically requests one bounded page when
the epoch changes, or when the reader was caught up before an active head
notification. An existing backlog requires explicit reading. That is a credible
separate explanation for a sparse **display** after late join or backlog; the
React hook and rendered feed were not browser-tested here. The successful
socket/history witness rules out a lost server chat in these runs, not a UI
catch-up problem in an observed production match.

For a real reported match, correlate these boundaries before attributing loss:

1. `(matchId, phaseId, seat, generation, jobId)` outbox and house-job identity;
   due time, generation start, deadline, attempts and response/null outcome.
2. `house_inference.job` and latency (existing log), then submission result and
   durable `house:<jobId>` receipt. The existing inference log alone does not
   distinguish silence from rejected submission or skipped jobs.
3. Accepted chat `eventKey`, its **audience-specific** stream sequence, and
   `(visibilityEpoch, streamHead)` on the observed socket.
4. Requested page `(epoch, after, through)`, returned `cursor`/`hasMore`, then
   client accepted cursor, cache/event key and rendered feed item. Sequence
   numbers from different seats or terminal epochs must not be compared directly.

This is a proposed correlation recipe, not a request to add production logging
in TIM-7. Use minimal metadata for real traces; avoid publishing private prompts.

## Ranked falsifiable hypotheses

| Rank | Hypothesis and falsifiable prediction                                                                                                                                                                                                                                        | Evidence / status                                                                                                                                                                                                                                                                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Selection and one-shot job identity suppress breadth and continuation. If this causes the symptom, an always-speaking provider still leaves legal speakers without activations; changing eligibility/activation allocation should improve coverage without changing prompts. | **Supported.** The real outbox/runner/receipt trace is red in Act I and Act II, including two-seat endgame. `match.ts:997–1035` restricts first jobs to distance `<4`, follow-ups to `<2`, and uses insert-or-ignore one-shot IDs.                                                                 |
| 2    | Absolute-seat offsets plus shorter Act II windows consume reply slack. If so, equal actor-relative positions have different slack after anchor rotation, and wakeup delay preferentially removes late-seat replies.                                                          | **Supported.** Seat-8 500 ms slack; seat-9 no second slot; +1,000 ms control loses eleven Act II follow-ups, including four pre-provider expirations. Changing to living-seat/anchor-relative bounded allocation is the falsifying intervention.                                                   |
| 3    | Real models underuse delivered context or prefer silence under the Succession prompt. If so, replaying identical entitled prompts with a reply-oriented prompt should improve addressed responses at fixed scheduler opportunities.                                          | **Unresolved.** Synthetic output proves delivery only. The Succession system prompt asks for a useful message/null but lacks the explicit “specific question, claim, or reply; avoid repetition” wording in the original game's prompt. That difference is a lead, not a causal finding.           |
| 4    | History freshness is lost in an external-agent loop or during concurrent model work. If so, a `say` can occur before delivery of the most recently advertised history, or generation can complete after peers have spoken.                                                   | **External ordering lead; concurrent case unresolved.** Bundled skill steps 31–39 place optional speech before the explicit history walk. Protocol 2 observation carries only metadata. House-path serial reads are fresh here; no installed external child or overlapping inference is exercised. |
| 5    | UI backlog makes accepted dialogue look absent. If so, receipts/events exist and socket head advances while delivered/rendered cursor lags.                                                                                                                                  | **Mechanism supported; reported-match attribution unresolved.** The real main-trace reader needs 13 pages and the hook auto-loads only one in backlog conditions. No DOM or production-browser evidence collected.                                                                                 |

## Proposed bounded TIM-14 split and acceptance

These are proposals for the parent to scope, not changes made on this branch.

### A. Scheduler and pacing

- First define “opportunity”: a bounded model activation with enough response
  time, not compulsory speech. Allocate a first activation to each eligible
  living house seat, and reserve a second for a seat that receives a peer reply
  while cooldown and a response budget fit. Rank/stagger by living-seat position
  relative to the current anchor; do not leave dead ring positions consuming
  the opportunity quota. Keep mandatory actions higher priority.
- Initial bound: **at most two chat activations per eligible seat per phase**,
  including null responses. Do not turn every incoming chat into an unbounded
  activation. Treat a more general third-response loop as separate scope if
  product wants it; the opening trace shows why the current cap matters.
- Prefer redistributing starts within existing windows before raising clocks.
  Evaluate an explicit **1,000 ms generation budget plus dispatch allowance**
  for reply slots; the current 350 ms effective generation allowance is not a
  plausible default to assume without measurement. Provider concurrency and
  admission reservations must be measured before selecting that budget.
- **Acceptance:** the default opening test and the 100-phase test without
  `TIM7_REPORT_ONLY` pass both opportunity assertions; repeat with all anchors,
  sparse living-seat layouts and mixed house/external seats. With a deterministic
  1,000 ms provider completion delay and separately injected 1,000 ms wakeup lag,
  every allocated job must either have the stated slack or report an explicit
  bounded skip reason. Add a concurrent provider fixture for that latency gate;
  `TIM7_LAG` alone does not satisfy it. No duplicate message after replay/restart,
  no obsolete-phase acceptance, no new required-action timeout/forfeit.
- **Cost/duration gate:** report calls, peak concurrency/RPM, and estimated usage
  under the real reservation coordinator. Raising the current six-call maximum
  to twenty is up to **3.33×** chat calls per full-table window; unconditional
  permits in this baseline cannot validate affordability. Keep existing phase
  durations initially. If a bounded extension is proposed, quantify it against
  all 120 Act II turns: adding five seconds per discussion adds ten minutes.
  The existing legal long path is already **4h19m59.520s for Act II alone**
  (`docs/evidence/succession-long-path.md`); do not increase every clock blindly.

### B. Prompt, context, and external loop

- Reorder optional external speech after delivery of a bounded fresh recent
  history view. Mandatory choices retain priority over history. Track delivered
  cursor separately from advertised head; do not call a current read “history
  consumed.” Keep backlog work bounded and recheck phase/cooldown before saying.
- Compare the Succession prompt with a minimal explicit request to address a
  specific prior claim/question, preserving permitted bluffing and silence.
  Supply speaker/event provenance and relevant recent questions within the
  existing entitlement/byte boundaries. Do not make output-rate alone the goal.
- **Transport acceptance:** marker messages accepted before activation must be
  present in entitled recent context and provider prompt whenever within the
  selected recent horizon. Include long Unicode messages, maximum notes,
  64-event truncation, phase changes during generation, takeover, and epoch
  reset. External scripted-agent tests must prove fresh history delivery before
  optional `say`; required actions must still meet deadlines with a backlog.
- **Model-quality acceptance (a separately authorized evaluation):** preregister
  at least 30 held-out reply opportunities from real entitled snapshots, stratify
  by act and context length, keep scheduler slots and model fixed, and compare
  original versus candidate prompt. Label whether each response specifically
  addresses another seat's claim/question, is non-repetitive, and respects
  private entitlement; report silence separately. Proposed minimum: at least
  80% of non-silent replies address a concrete preceding statement and no private
  entitlement violation in the sample. Report the silent fraction and confidence
  intervals; do not infer quality from this deterministic provider. This branch
  performs none of those paid trials.
- **UI acceptance is separate:** a late join/reconnect with more than one page
  of backlog must expose a truthful caught-up/backlog state and a bounded route
  to recent dialogue. Correlate accepted event keys through pages and rendered
  items. A product decision about auto-catch-up is required; a scheduler change
  cannot repair an unread feed.

### Regression checks to retain

Use the existing house-provider integration for structured responses, retries,
persisted responses/receipts, budget usage and obsolete delivery; Worker tests
for recovery, takeover and sealed audience delivery; UI-stream tests for cursor
and epoch fences; worker-bounds tests for 14 KiB observations, 16 KiB envelopes,
bounded pages/context; and the legal long-path test for pacing and supervisor
limits. Add only the missing opportunity, concurrent latency and external
history-before-speech seams. Do not replace these with formula snapshots.

## Files and verification

- `tests/fixtures/dialogue-baseline-worker.ts`: isolated real-Worker driver and
  boundary probes; production subclasses keep scheduling and execution intact.
- `tests/fixtures/dialogue-baseline-report.ts`: trace-derived metrics.
- `tests/dialogue-baseline.integration.ts`: red-capable opportunity check plus
  real provider/socket/history correlation and artifact output.
- `tests/dialogue-baseline.wrangler.jsonc`,
  `vitest.dialogue-baseline.config.ts`: local-only isolated configurations.
- `tests/succession-provider-server.ts`: opt-in reply/silent behavior; default
  existing provider behavior remains the marker-then-silence policy.
- `.gitignore`: generated `.tim7/` artifacts.

Checks run:

```sh
npx tsc --noEmit
npm run typecheck
npx tsc --noEmit -p tsconfig.succession-provider.json
npx vitest run tests/house-model.test.ts tests/succession-ui-stream.test.ts
npx oxlint tests/dialogue-baseline.integration.ts tests/fixtures/dialogue-baseline-worker.ts tests/fixtures/dialogue-baseline-report.ts tests/succession-provider-server.ts vitest.dialogue-baseline.config.ts
npx prettier --check tests/dialogue-baseline.integration.ts tests/fixtures/dialogue-baseline-worker.ts tests/fixtures/dialogue-baseline-report.ts tests/dialogue-baseline.wrangler.jsonc tests/succession-provider-server.ts vitest.dialogue-baseline.config.ts
npx prettier --ignore-path /dev/null --check docs/evaluation/TIM-7-dialogue-baseline.md
```

The seven focused existing tests pass. The diagnostic measurement runs pass
their transport checks; the default opportunity command remains intentionally
red. No production implementation fix is claimed. Parent remains the sole
Linear writer and integration/cleanup coordinator; no push is performed.
