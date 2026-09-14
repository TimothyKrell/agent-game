# TIM-26 — matched budget comparison and release decision

## Decision summary

**The paid-house full-path reliability regression is confirmed on the matched
fixture.** Baseline `f802335` finishes with 392 mandatory calls and $0.9774196
charged. Reviewed `c38b4d0` interrupts at phase 121, after 320 mandatory calls
and $1.461404 charged. More optional inference consumes the balance; mandatory
in-flight estimates then cause an avoidable immediate refusal.

A bounded transient-pressure retry addresses that immediate refusal, but is not
an established full-path fix. Recommend protecting measured future mandatory
headroom and bounding aggregate optional demand, with initial opportunities
ahead of follow-ups. No budget policy/default is implemented in this follow-up;
the parent must agree the approach and require a full-path regression check
before integrating the broader paid-house scheduling change.

The accompanying production change only fixes silent-first/peer follow-ups.
It does not resolve this budget release gate.

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

## Bounded options within $1.50 / $5 and current clocks

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

## Evidence / handoff

Comparison directory: `/tmp/opencode/agent-game-TIM-26-budget-comparison/.tim7/comparison/`.
It contains four `trace.json`/`summary.json` pairs, test logs,
`measurement-fixture.diff`, `manifest.json` (source blobs and SHA-256 evidence checksums),
`summarize.mjs`, and `results.json` (per-kind costs,
action counts/digests, refusal ledger and feasibility arithmetic). Run
`node .tim7/comparison/summarize.mjs` there to regenerate the compact comparison.
A minimal copy is at `/tmp/opencode/agent-game-TIM-26/.tim7/TIM-26-budget-comparison-results.json`.

The detached comparison worktree intentionally retains the three old production
files and disposable measurement adaptations for archive/reproduction. No user
worktree was removed. All test servers stop in `finally`; previous c38 artifacts
remain intact. The parent owns integration, budget-policy approval and cleanup.
