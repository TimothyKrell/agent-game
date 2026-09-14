# TIM-26 — matched budget comparison and release decision

## Decision summary

**The approved bounded policy closes the measured paid-house reliability gate.**
The final seed-7 run finishes at phase 178 with all **392 mandatory choices**,
**zero mandatory refusals/timeouts**, **412/488 funded initial activations** and
**154 follow-ups**, at **$1.2804700**. The seed-1 holdout also finishes under the
unchanged $1.50 reservation. See [selected policy and verification](#selected-policy-and-verification).

The original regression remains preserved as a negative control. Baseline
`f802335` finishes with 392 mandatory calls and $0.9774196 charged; unprotected
`73d028b` repeats c38's interruption at phase 121/$1.461404. Only the approved
budget-protection policy changes production behavior in this follow-up.

### Original comparison conclusion (preserved from 73d028b)

The paid-house full-path reliability regression was confirmed on the matched
fixture. Baseline `f802335` finishes with 392 mandatory calls and $0.9774196
charged. Reviewed `c38b4d0` interrupts at phase 121, after 320 mandatory calls
and $1.461404 charged. More optional inference consumes the balance; mandatory
in-flight estimates then cause an avoidable immediate refusal.

A bounded transient-pressure retry addresses that immediate refusal but does not
alone establish full-path affordability. The parent subsequently approved
aggregate optional limits and required-capacity protection; the implementation
and new release-gate results below supersede the earlier pending-policy status.

## Apples-to-apples method

Created detached worktree
`/tmp/opencode/agent-game-TIM-26-budget-comparison` from **c38b4d0**. All original
TIM-26 files/evidence were preserved while read-only reviews ran. Ran c38 first,
then replaced **only** `src/server/match.ts`, `src/server/house-seat.ts`, and
`src/server/house-contract.ts` with their exact `f802335` versions. Verified:

```sh
git diff f802335 --exit-code -- src/server/match.ts src/server/house-seat.ts src/server/house-contract.ts
```

The same c38 concurrent provider fixture, real coordinator, seed **7**, normal
clocks, **1,000 ms** generation latency, zero wakeup lag, gpt-4.1-mini pricing,
and **estimated** token charges run on both sides. The charge is input UTF-8
bytes/4 and generated JSON bytes/4, rounded up. No provider choices, prices,
budgets, or timing constants were changed to obtain a pass. Ports are OS-assigned;
inference is loopback-only with fixture credentials. Installed dependencies were
reused; no package/type-policy bypass or dependency update.

Disposable measurement adaptations only:

- `TIM26_COMPARISON=1` permits old missing coverage and old insufficient slack,
  and observes either a real terminal state or the requested checkpoint rather
  than prescribing success/interruption. It retains provider/context association,
  genuine concurrency, latency, two-slot, $1.50 ceiling, and socket/history checks.
- The existing `SELECT *`/optional outcome fields already tolerate the old house
  table. Missing new columns are not invented or backfilled into production.
- Instrumented the real coordinator subclass to capture the usage ledger, each
  reservation's settled/accounted/in-flight balance before admission, and each
  actual-cost recording. Calls still execute the unchanged coordinator logic.

All four commands passed and persisted full evidence after their requested run:

```sh
# For each side, use TIM7_NAME=comparison/<side>-<limit>, side=f802 or c38.
TIM26_COMPARISON=1 TIM7_NAME=comparison/f802-100 TIM7_PHASES=100 TIM26_LATENCY=1000 TIM26_USAGE=estimated npx vitest run --config vitest.dialogue-baseline.config.ts
TIM26_COMPARISON=1 TIM7_NAME=comparison/f802-200 TIM7_PHASES=200 TIM26_LATENCY=1000 TIM26_USAGE=estimated npx vitest run --config vitest.dialogue-baseline.config.ts
TIM26_COMPARISON=1 TIM7_NAME=comparison/c38-100 TIM7_PHASES=100 TIM26_LATENCY=1000 TIM26_USAGE=estimated npx vitest run --config vitest.dialogue-baseline.config.ts
TIM26_COMPARISON=1 TIM7_NAME=comparison/c38-200 TIM7_PHASES=200 TIM26_LATENCY=1000 TIM26_USAGE=estimated npx vitest run --config vitest.dialogue-baseline.config.ts
```

These measurement exemptions exist only in the disposable comparison worktree,
not in the follow-up production acceptance tests.

## Results

“Estimated” is the cumulative conservative admission estimate; it is released
downward when each synthetic actual charge arrives. It is not settled spend.

| Production / requested phases | Final status / phases | Mandatory calls | Mandatory estimated / charged USD | Optional calls | Optional estimated / charged USD | Total charged USD |
| --- | --- | ---: | --- | ---: | --- | ---: |
| f802 / 100 | active / 100 | 250 | 1.5456752 / 0.3491672 | 193 | 1.1330660 / 0.2641672 | 0.6133344 |
| c38 / 100 | active / 100 | 250 | 1.4297044 / 0.3203596 | 680 | 3.7742420 / 0.8761516 | 1.1965112 |
| f802 / 200 | **finished / 178** | **392** | 2.4938880 / 0.5652728 | 289 | 1.7630248 / 0.4121468 | **0.9774196** |
| c38 / 200 | **interrupted / 121** | **320** | 1.8545968 / 0.4162808 | 800 | 4.4976688 / 1.0451232 | **1.4614040** |

| Production / requested phases | Initial opportunities I; II | Accepted chats | Rejected chats | Admission refusals | Peak RPM / concurrent | Virtual ms |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| f802 / 100 | 76/190; 60/150 | 189 | 4 | 0 | 89 / 10 | 661,100 |
| c38 / 100 | 190/190; 150/150 | 680 | 0 | 0 | 160 / 10 | 661,098 |
| f802 / 200 | 76/190; 129/298 | 276 | 13 | 0 | 89 / 10 | 928,197 |
| c38 / 200 | 190/190; 210/210 | 800 | 0 | 1 mandatory | 160 / 10 | 795,120 |

All usage is known, all HTTP calls retain the unchanged one-second latency, and
there are no rejected mandatory submissions. The old scheduler spends on some
chat that arrives too late; those 13 rejected chats are included in its cost.
The two-millisecond difference at 100 phases comes from actual scheduling, not
different engine windows. The new side reproduces the prior reviewed numbers.

The 250 mandatory choices at 100 phases match; the common 320-action prefix at
200 requested phases also matches by act, phase kind, round, seat, selected legal
choice index, action type, target and payload structure. Two payloads use
different generated card IDs because additional chat consumes event/ID serials.
The analysis normalizes only `tim7-<number>` identifiers for this comparison;
it does not alter choices or requests. Full unnormalized provider payloads are
retained. Baseline has 72 additional mandatory calls after the shared prefix.

## Transient pressure at the failure

Denied job: `succession:tim7-1942:9:0:action:attempt:1`.

- At **1,800,000,735,122**, settled usage is **$1.4504692**.
- Eight **mandatory** in-flight reservations hold **$0.0484444**; accounted usage
  is **$1.4989136**. No optional call is in flight at this instant.
- Requested mandatory estimate: **$0.0060672**. It fits settled balance but not
  current accounted balance. The coordinator returns the final deadline
  **1,800,000,795,120**, so the runner records zero-attempt admission denial.
- At **1,800,000,736,122**, a real recording reduces accounted usage to
  **$1.4895216**: the request would fit after **1,000 ms**, with **58,998 ms** left.
- After outstanding calls settle, charged/accounted usage is **$1.461404**.

This is transient conservative pressure, made reachable by accumulated optional
spend. The published report's “in-flight estimates” finding is now supported by
the unchanged-old-side measurement and a timestamped ledger.

## Bounded options considered before approval

### 1. Retry genuinely transient pressure

If settled/irreversible usage plus the requested estimate exceeds the limit,
waiting cannot help. If it fits and live reservations account for the excess,
a bounded retry before the useful deadline may help. The ledger proves a retry
can admit the **specific failed decision** after one second. Preserve mandatory
priority as funds are released; prevent optional arrivals consuming every release.

This alone does not establish completion. The baseline's remaining 72 mandatory
calls cost **$0.1084552**. Appending those observed costs to c38's settled prefix
would total **$1.5698592**, even with no more optional inference. This is an
explicit cost-replay counterfactual, not a run of c38 beyond interruption; prompt
costs would depend on subsequent dialogue. It demonstrates why an immediate
retry pass is insufficient evidence of no regression.

### 2. Reserve future mandatory headroom

The measured complete-path mandatory charge is **$0.5652728** and its largest
simultaneous conservative mandatory batch is **$0.061246**. These imply:

- At most **$0.9347272** for optional charges if future mandatory charges equal
  that observed complete path and transient concurrency is separately handled.
- A conservative illustrative envelope of **$0.8734812** if the entire observed
  mandatory charge plus that additional batch allowance is protected.

These are measured feasibility bounds, **not proposed universal defaults**.
Remaining mandatory work depends on rules, model, state and match length;
observed token usage is not a tokenizer guarantee. A production headroom model
must make those assumptions explicit and pass this full-path gate.

### 3. Bound aggregate optional demand; prioritize first opportunities

Reserving headroom necessarily denies some optional work. In the c38 prefix,
400 first slots cost **$0.5292992** and 400 follow-up slots **$0.5158240**.
Projecting the observed first-slot average onto the baseline's 488 eligible
seat-windows gives **$0.6457450** for all initial slots. Combined with the observed
full mandatory charge and batch allowance, that is **$1.2722638**, leaving about
**$0.2277362** for follow-ups (roughly 176 at the prefix average).

Thus **first-pass priority plus bounded follow-ups mathematically fits the
observed-cost projection**; unrestricted two-pass demand does not. The projected
first-pass cost is not an executed initial-only run. Fewer messages can change
prompt sizes and later costs, so this remains a candidate for parent approval
and subsequent real-path verification, not a guarantee or hardcoded quota.

A fixed optional envelope and a dynamic remaining-mandatory reservation are
different controls: the former bounds cumulative optional spend; the latter
protects estimated upcoming mandatory work and may release unused allowance.
Either needs transient-pressure handling and explicit denial reasons. A pure
per-seat two-job cap cannot substitute for an aggregate cost bound.

### Fairness statement and release gate

State the promise as: every eligible living house seat receives a funded initial
activation with useful time **or an explicit admission/time skip**; initial
opportunities outrank follow-ups, allocated in rotating living-seat order.
After a completed initial activation, previously unseen peer speech may admit
one further activation, including after intentional silence. Report raw
eligibility, funded coverage and each skip reason separately.

This does not promise every seat is admitted when the budget cannot fund it,
nor guarantee arbitrary-length games under any model. Before releasing a budget
policy, rerun the matched full path: **392 mandatory choices, a real phase-178
finish, no optional-induced mandatory refusal/timeout, the same $1.50/$5/clocks,
and explicit, fairly allocated optional skips**. Also retain the 100-phase
coverage, latency, concurrency, silence and mixed-controller regressions.

## Selected policy and verification

### Runtime policy

`src/server/coordinator.ts` applies two named allocation assumptions to **paid,
all-house allocations only**, using the allocation's actual reservation:

| Control | Allocation fraction | At the existing $1.50 reservation |
| --- | ---: | ---: |
| Aggregate optional ceiling (`OPTIONAL_SHARE`) | 0.50 | $0.750000 |
| Follow-up sub-ceiling (`FOLLOWUP_SHARE` = 0.25 of optional) | 0.125 | $0.187500 |
| Required capacity protected against optional spending | at least 0.50 | at least $0.750000 |
| Optional capacity follow-ups cannot consume | at least 0.375 | at least $0.562500 |

These are conservative allocation fractions, not a prediction of future actions.
The measured baseline's $0.5652728 required charge plus $0.061246 peak required
estimate batch provides evidence that protecting half of $1.50 is plausible;
neither that cost nor any phase/action count appears in the production policy.
Required work can use the entire remaining match balance. Initial work may use
the entire optional envelope; follow-ups cannot borrow from its protected share.
Unused required capacity is deliberately not speculatively released to chat.
Different reservations scale both ceilings; model prices feed the existing
per-request estimate and recorded actual usage. There is no seed quota, future
trace lookup, tokenizer change, or budget/clock/model change.

Each new usage row stores `kind=required|initial|followup`. Existing rows receive
a nullable additive column; canonical old usage IDs classify their existing
costs without rewriting them. Unknown old non-action IDs count against optional
funding conservatively. Every envelope accounts `actual ?? reserved`, including
all live estimates and the **full reserve for completed unknown usage**. Expired
unfinished rows remain charged at their reserve and cannot justify retrying.
`inferenceSummary().funding` separates first/follow-up/required call counts,
cumulative admission estimates, measured charges, current accounted cost and
irreversible cost. The house runner persists the last `admission_reason`, keeps
the existing explicit outcome, and logs reason/retryability/deadline. A successful
retried job may retain its prior denial reason; it is still counted as activated
only if inference actually ran.

As with the existing summary, `funding.calls` counts admitted usage rows, including
unknown failures or zero-cost releases; actual HTTP calls are counted separately
from the provider trace. The full-path tables have a one-to-one correspondence;
the injected pressure probe explicitly has one extra zero-charge reservation.

All applicable budget ceilings are checked before choosing a retry. Any permanent
exhaustion wins over another ceiling's temporary pressure or an RPM wait. When
every irreversible balance plus the requested estimate fits, but live reservations
block admission, retry in **1,000 ms** only if the existing useful-time allowance
still fits (500 ms required; 1,150 ms optional). RPM continues using the actual
oldest request plus 60,001 ms. Otherwise return a permanent denial at the deadline.
Unknown actual usage never becomes zero merely because a request completed.

Transient required waiters are durable in `inference_waiters`; optional admissions
wait behind them across the shared coordinator. Follow-ups also wait behind
transient initial requests in their own match. Waiters are removed on admission,
permanent denial, terminal-job cleanup, allocation settlement, or expiry of useful
time. The same logical usage ID is retried
without incrementing provider attempts. A saved generated response still uses the
existing receipt/recording path rather than running inference again. No new alarm
or unbounded background polling loop is introduced.

**Existing ceiling scope is preserved:** both kinds of paid all-house work obey
the full match cap; only optional work obeys the daily inference-admission check.
Mandatory calls already bypass that daily check (including mixed matches), with
paid all-house funding protected by existing match allocation/admission. Mixed
matches retain their existing exemption from the match cap and these new
all-house sub-ceilings; mixed optional work still obeys the global daily ceiling.
Preview retains its prior match-cap exemption. Global rolling limits remain
**180 optional / 250 mandatory** across games and allocations. The configured
$5 daily budget and $1.50 reservation are unchanged.

### Red/green full-path gate and holdout

`TIM26_BUDGET_GATE=1` requires a real finish, no unserved required jobs, more than
two-thirds funded initial coverage, explicit optional skips, and bounded/fair
follow-up funding. Seed 7 additionally requires exactly 178 phases/392 required
choices. On unprotected `73d028b`, it fails at the **finish** assertion with the
same phase-121 interruption. It is not an expected-interruption acceptance test.

| Run | Status / phases | Required calls / charged USD | Initial calls / charged USD | Follow-up calls / charged USD | Total USD | Peak RPM / concurrency | Virtual ms |
| --- | --- | --- | --- | --- | ---: | --- | ---: |
| f802 baseline, seed 7 | finished / 178 | 392 / 0.5652728 | old optional slots combined: 289 / 0.4121468 | included at left | 0.9774196 | 89 / 10 | 928,197 |
| unprotected 73, seed 7 | interrupted / 121 | 320 / 0.4162808 | 400 / 0.5292992 | 400 / 0.5158240 | 1.4614040 | 160 / 10 | 795,120 |
| **protected, seed 7** | **finished / 178** | **392 / 0.5355676** | **412 / 0.5619080** | **154 / 0.1829944** | **1.2804700** | **110 / 10** | **928,191** |
| holdout, seed 1 | finished / 173 | 373 / 0.5117564 | 406 / 0.5609756 | 154 / 0.1830828 | 1.2558148 | 111 / 10 | 861,190 |
| seed 7 + 1,000 ms wakeup lag | finished / 178 | 392 / 0.5355676 | 412 / 0.5619080 | 154 / 0.1830416 | 1.2805172 | 99 / 10 | 1,051,191 |

All protected estimated runs have zero required refusals, unknown costs, rejected
submissions, and unserved required actions. Seed-7's complete **392-choice**
sequence matches the old baseline by act/phase kind/round/seat/legal choice index
and normalized payload, not just action count. Only opaque `tim7-<number>` IDs
are normalized. The combined-delay run matches as well. Holdout choices are
intentionally not compared to seed 7; its different seed successfully finishes.

The seed-7 conservative estimate sums are $2.3743104 required, $2.4112752 initial,
and $0.7930288 follow-up; those cumulative estimates are **not** settled spend.
All final usage is settled, and all four kinds of ceiling remain enforced.

**Coverage is budget-limited:** initial coverage is **190/190 Act I + 222/298 Act
II = 412/488 (84.4%)**, versus old **205/488 (42.0%)**. There are 76 explicit
initial budget skips. Funded firsts by seat 0–9 are
`[42,42,41,41,41,41,41,40,41,42]`; totals reflect living participation. The 154
funded follow-ups by seat are `[15,15,15,15,16,16,16,16,15,15]`. Follow-ups have
229 explicit budget skips and three time skips. Later Act II gets no funded
follow-ups once their aggregate share has been spent. This is fair rotating
allocation while funds remain, not a promise of funded dialogue in every phase.

Reservation refusals and skipped jobs differ: seed 7 has **43 transient follow-up
budget refusals + 41 transient initial budget refusals**, followed by **229 / 76
permanent** refusals respectively. No transient required refusal was needed on
the protected full path. Holdout first coverage is **406/451 (90.0%)**, with 45
initial budget skips; follow-ups are again 15–16 per seat, 225 budget skips and one
time skip. Combined-delay coverage/calls remain the same as seed 7, with 121
follow-up budget skips and 111 time skips, plus the same 76 initial budget skips.

### Reliability and regression controls

- **Real required-pressure/restart probe:** a clearly isolated fixture mode uses
  the real coordinator to hold an extra required reservation before the first
  mandatory decision, then releases it for $0 after 1,000 ms. The runner records
  one transient denial, is actually evicted/reconstructed with duplicate enqueue,
  and retries the same usage ID at +1,000 ms. It submits successfully with **one
  provider attempt, one usage row and one accepted submission**. There are 41 provider calls
  plus one explicitly synthetic, zero-charge reservation; it is excluded from the
  ordinary full-path runs. The initial probe needed its job inspection endpoint
  corrected before the cold-restart assertion passed; the retry itself worked.
- **Healthy 100-phase generation:** 340/340 firsts and 340/340 follow-ups, 930
  provider calls, $0.066960 synthetic charges, concurrency 10/RPM 160, no refusals
  or skips. The default healthy low-cost fixture retains all coverage.
- **Silent-peer recovery:** 4 silent firsts + 4 fresh replies, 8 provider calls,
  one lost acknowledgement and cold restart; no duplicate inference or public
  no-op. Both the silent-record and coordinator changes are exercised together.
- **Ceiling-charge negative control:** requested 200 phases interrupts at 65,
  133 required + 110 initial + 39 follow-up calls, $1.4943304 settled. Six required
  requests first meet transient pressure, then are permanently refused after
  outstanding estimates settle at full charge. This explicitly remains a funding
  failure, not a green completion. At this point required charges are $0.7464192
  and optional $0.7479112; this particular negative run does not establish the
  cost of a different, chat-free path. The complete protected path's recorded
  required estimates alone sum to $2.3743104 at the ceiling charging rule, above
  $1.50. Coordinator tests separately verify permanent mandatory-only exhaustion.

The protected full path initially exposed an incorrect freshness assertion: the
last chat aged outside the existing 64-event entitled recent-history window.
The fixture now records its actual **seat-stream sequence** and distinguishes
aged-out history from a missing recent chat. All in-window latest chats and the
latest supplied recent chat still must reach the actual provider prompt. The
history/window and production prompt are unchanged. All socket/history-delivery
checks pass; evidence records the aged-out counts.

### Reproduction commands and checks

All commands below use the original seed/choices/provider/prices and local
`vitest.dialogue-baseline.config.ts`. Final commands (prefix each with the name):

```sh
TIM7_NAME=budget-final-ceilings-full TIM7_PHASES=200 TIM26_LATENCY=1000 TIM26_USAGE=estimated TIM26_BUDGET_GATE=1 npx vitest run --config vitest.dialogue-baseline.config.ts
TIM7_NAME=budget-final-holdout TIM26_SEED=1 TIM7_PHASES=200 TIM26_LATENCY=1000 TIM26_USAGE=estimated TIM26_BUDGET_GATE=1 npx vitest run --config vitest.dialogue-baseline.config.ts
TIM7_NAME=budget-combined-deadline TIM7_PHASES=200 TIM26_LATENCY=1000 TIM7_LAG=1000 TIM26_USAGE=estimated TIM26_BUDGET_GATE=1 npx vitest run --config vitest.dialogue-baseline.config.ts
TIM7_NAME=budget-healthy-generation TIM7_PHASES=100 TIM26_LATENCY=1000 npx vitest run --config vitest.dialogue-baseline.config.ts
TIM7_NAME=budget-silent-peer-recovery TIM26_SILENT_FIRST=1 TIM26_HOUSES=4 TIM26_LATENCY=1000 TIM26_RECOVERY=1 npx vitest run --config vitest.dialogue-baseline.config.ts
TIM7_NAME=budget-final-required-retry TIM7_PHASES=3 TIM26_LATENCY=1000 TIM26_REQUIRED_PRESSURE=1 npx vitest run --config vitest.dialogue-baseline.config.ts
TIM7_NAME=budget-final-ceiling-negative TIM7_PHASES=200 TIM26_LATENCY=1000 TIM26_USAGE=ceiling npx vitest run --config vitest.dialogue-baseline.config.ts
```

Red: run the full-gate command with `TIM7_NAME=budget-protection-red` after adding
only the gate to unprotected `73d028b`. Both initial full-gate and coordinator
red logs are retained. The original four-side comparison is untouched.

Coordinator SQLite tests exercise scaled allocations, follow-up and initial
priority, live versus settled/unknown/expired usage, legacy additive migration,
cold reconstruction/replay, same-ID admission/settlement, useful-time bounds,
waiter expiry, global RPM/daily scope, mixed mandatory/optional exemptions, and
permanent exhaustion taking precedence over unrelated transient pressure. These
run alongside the shared-game, model, stream and long-path tests. Worker/provider
and build/type/lint checks are recorded in the dialogue report.

## P2 follow-up: terminal waiter lifecycle

Parent review reproduced a stale-priority defect in `b9667de`: after match recovery
replaced the phase identity, the old runner correctly became `done/obsolete` with
zero attempts, but its required waiter still blocked optional work in unrelated
matches until the old deadline. Initial waiters similarly blocked same-match
follow-ups, and allocation settlement did not remove either kind.

### Focused correction

- `retireInferenceWaiter({id, matchId})` deletes **only** that exact priority row.
  It never updates, deletes, settles or refunds a `usage` row. A different phase,
  generation, attempt or allocation cannot be retired by an old cleanup message.
- The runner persists the exact usage ID in additive `jobs.waiter_id` **before**
  calling admission, covering an uncertain admission acknowledgement. An acknowledged
  admission or permanent denial clears it because the coordinator already removed
  priority. A transient denial retains it through the existing same-ID retry.
- Every terminal outcome makes any retained ID immediately due for cleanup. The
  terminal status/outcome/completion time are committed first. Cleanup is outside
  the inference exception handler, so a lost acknowledgement cannot reopen the
  job, increment attempts, re-record usage or repeat a saved provider response.
- A failed cleanup keeps the exact ID and schedules a durable alarm at **+1,000
  ms**. A cold runner retries that cleanup; a successful acknowledgement clears
  the local ID. At most one due cleanup is processed at each alarm entry/exit.
  Existing live-job scheduling still uses the same `due_at` column; a terminal
  row's `due_at` now means its cleanup retry time.
- The transactional additive migration reconstructs the next possible waiting attempt ID for
  old response-less jobs, including already-terminal jobs with no recorded denial
  reason. Previously admitted attempts have already retired their priority; a
  reconstructed absent ID is an idempotent no-op. Migration rearms pending cleanup.
- Allocation settlement deletes all of **that allocation's** priority rows in the
  existing settlement transaction, retaining other allocations' waiters and every
  live/completed/unknown usage record. Settlement replay is idempotent.

Retirement starts when the runner recognizes a terminal/obsolete job or the
coordinator settles its allocation; this change does not proactively walk every
sleeping runner on each phase update. Until recognition, normal runner wakeups and
the existing useful-deadline expiry still apply. A cleanup transport outage retries
at one-second intervals without additional inference; expiry remains a fallback
bound on stale priority while delivery is unavailable.

### Red/green evidence and final full-path check

The first three real Worker/SQLite tests were **red on b9667de**: required recovery,
initial recovery and allocation settlement each retained the old waiter. Artifacts
are `.tim7/waiter-lifecycle-red/` and `.tim7/waiter-lifecycle-red.log`.

**Ten final lifecycle tests pass** (7.33 seconds) using the actual coordinator,
runner and match recovery paths, with no provider generation:

| Cases | Evidence |
| --- | --- |
| Required and initial phase recovery | Real new phase ID; old job `done/obsolete`, attempts 0; old priority gone; previously blocked optional request admitted |
| Cleanup delivery failure, both kinds | Waiter remains until durable +1,000-ms retry after actual house eviction/reconstruction |
| Lost cleanup acknowledgement, both kinds | Coordinator already deleted old priority; identical retry is harmless; terminal timestamp and attempts unchanged |
| Prior-schema migration, both kinds | Remove the new column and old denial reason in the isolated fixture; cold reconstruction recovers cleanup and retires the stale waiter |
| Settlement, ordinary and lost acknowledgement | Actual coordinator eviction after settlement write, replay on a fresh stub; own waiters gone, foreign initial waiter still blocks follow-ups |

The six cleanup-recovery cases install a **live replacement job's waiter before
replaying old cleanup**. The replacement still enforces required/initial priority;
wrong-allocation cleanup is also a no-op. Usage arrays are byte-for-byte equal
across retirement, including a completed unknown $0.10 reservation and a still-live
$0.05 reservation. Only explicitly recording the isolated pressure reservation
releases its estimate. Fixture restart probes must reacquire fresh RPC stubs after
eviction; correcting that probe behavior resolved the first cold-restart run's
transport errors without changing production behavior.

The same full-path gate again **finishes phase 178 with 392 mandatory choices**,
zero required refusals, **$1.2804700**, **412/488 firsts** and **154 follow-ups**.
All 392 normalized choices match the old `f802335` baseline. Provider calls remain
958, peak RPM 110/concurrency 10, virtual duration 928,191 ms. Funding assumptions,
ceilings, prices and phase clocks are unchanged.

```sh
# Red run: only the first three lifecycle tests/fixture added to b9667de.
TIM26_WAITER_NAME=waiter-lifecycle-red npx vitest run tests/inference-waiter-lifecycle.test.ts

# Final lifecycle and full-path commands.
TIM26_WAITER_NAME=waiter-lifecycle-final-atomic npx vitest run tests/inference-waiter-lifecycle.test.ts
TIM7_NAME=waiter-final-full TIM7_PHASES=200 TIM26_LATENCY=1000 TIM26_USAGE=estimated TIM26_BUDGET_GATE=1 npx vitest run --config vitest.dialogue-baseline.config.ts
npx vitest run tests/dialogue-shared.test.ts tests/platform-queue.test.ts tests/house-model.test.ts tests/succession-ui-stream.test.ts tests/succession-long-path.test.ts
TIM7_NAME=waiter-required-retry TIM7_PHASES=3 TIM26_LATENCY=1000 TIM26_REQUIRED_PRESSURE=1 npx vitest run --config vitest.dialogue-baseline.config.ts
npm run test:provider
```

The existing focused suite passes **31/31** (3.04 seconds); the provider suite
passes **3/3** (342.94 seconds). The live required-waiter cold-retry control also
passes, preserving its same-ID retry and single provider attempt. Build, typecheck,
lint, formatting and provider-receipt details are listed in the dialogue report.
`.tim7/waiter-proof.mjs` regenerates `waiter-proof.json` with the normalized action
digest, funding totals and per-case cleanup/priority/accounting results. All new
evidence uses `waiter-*` paths; the original budget and parent `lead-budget-*`
artifacts are untouched.

## Evidence / handoff

Comparison directory: `/tmp/opencode/agent-game-TIM-26-budget-comparison/.tim7/comparison/`.
It contains four `trace.json`/`summary.json` pairs, test logs,
`measurement-fixture.diff`, `manifest.json` (source blobs and SHA-256 evidence checksums),
`summarize.mjs`, and `results.json` (per-kind costs,
action counts/digests, refusal ledger and feasibility arithmetic). Run
`node .tim7/comparison/summarize.mjs` there to regenerate the compact comparison.
A minimal copy is at `/tmp/opencode/agent-game-TIM-26/.tim7/TIM-26-budget-comparison-results.json`.

New evidence is in `/tmp/opencode/agent-game-TIM-26/.tim7/budget-*/` and associated
logs, with `budget-report.mjs`/`budget-results.json` containing cost/coverage,
denial groups and normalized choice-sequence verification. Source snapshots
`c38b4d0` and `73d028b` remain immutable ancestors. The production policy reads
none of these artifacts. No package/lockfile, price, clock, or model change.

The detached comparison worktree intentionally retains the three old production
files and disposable measurement adaptations for archive/reproduction. No user
worktree was removed. All test servers stop in `finally`; previous c38 artifacts
remain intact. The parent owns final integration and cleanup.
