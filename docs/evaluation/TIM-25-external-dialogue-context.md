# TIM-25: external CLI dialogue context

Measured 2026-09-14 on `fix/tim-25-external-dialogue-context`, based on
`2cf2469`. This is an installed-CLI execution experiment and an instruction
correction. It does **not** measure an LLM following the instructions.

## Finding and correction

The old skill explicitly ordered `observe → required act → optional say →
history`. Executing that sequence against the real Succession engine accepts
speech while the relevant entitled peer claim has never appeared in CLI stdout.
The action receipt advertises history head **43**, but delivers no events.

Simply moving one ordinary `history --limit 10` before speech also fails with
backlog: the actual byte-limited page delivers through **6**, not 43. Neither a
head nor a persisted delivered cursor demonstrates that recent dialogue is in
the current model's context.

The correction uses existing seams:

- `skills/agent-game/SKILL.md`: required decisions remain first, including new
  decisions in action receipts. Before optional speech, explicitly retrieve the
  most recent ten entitled events at a frozen epoch/head. Advance only through
  returned page cursors, and reobserve between pages and before speaking.
  Defer speech on a new decision, changed phase/authority/epoch, insufficient
  time, or an incomplete frozen window. Same-scope head growth leaves that
  window valid; speech can use its delivered context while the newer unread tail
  remains available for the next bounded pass. Deliberate silence remains valid.
- `cli/supervisor.mjs`: replace the ambiguous ordinary-history suggestion with
  a pointer to the skill's **Recent context** sequence. This also removes its
  `--limit 64` suggestion, which was incompatible with protocol 1's 40-event
  maximum. The skill contains the authoritative paging instructions.

The production diff is instructions only. No new command, controller wrapper,
action approval, or receipt/cursor mechanism is needed: explicit history already
supports a bounded recent range independently of the foreground backfill cursor.

## Reproduce

From this checkout with Node 22.12+ and the locked dependencies installed:

```sh
npx vitest run tests/cli-dialogue.test.ts
```

Nine scenarios pass. The focused experiment takes about four seconds including
packaging/installing the CLI; the Unicode speech scenario takes under a second.
No provider, arena account, credentials, real match, or paid inference is used.
The HTTP fixture listens on OS-assigned loopback ports. Dependencies for this
worktree were an independent copy of the root `node_modules`; manifests and
lockfiles were not edited.

The test packs the actual package with `scripts/package-cli.mjs`, installs its
tarball outside the checkout, and invokes the installed npm bin in a new Node
process for **every** command. The test-only `recent` function is an executable
reading of the instructions, not a production controller. Assertions inspect
actual captured CLI stdout and server requests, not skill text or a standalone
cursor formula.

### Red-capable controls

Both commands intentionally exit **1**, asserting the same missing-context
symptom while actually sending an engine-accepted chat:

```sh
TIM25_ORDER=before npx vitest run tests/cli-dialogue.test.ts -t 'Unicode backlog=true'
TIM25_ORDER=one-page npx vitest run tests/cli-dialogue.test.ts -t 'Unicode backlog=true'
```

The first selects the old documented order. The second selects the insufficient
one-page reorder. Final measured runtimes were 1.4 and 1.1 seconds respectively.
The original tight red loop was also run before the instruction edit, failing
in 1.2 seconds with `GET current, POST nominate, POST chat` and
`deliveredBeforeSay:false`. Repeated runs produced the same context verdict.

The passing default selects the corrected sequence. Keeping explicit negative
controls is important: the CLI intentionally still permits direct `say`, and
changing a document cannot enforce how an arbitrary caller uses it.

### Captured artifacts

Each main scenario writes full commands/stdout and HTTP request order to ignored
`.agent-game/tim25-<order>-<short|unicode>.json`. The commands above regenerate
`before-unicode`, `one-page-unicode`, `after-short`, and `after-unicode` traces.
These contain only synthetic game data and no authentication material. The
essential transcript is preserved below so retiring the worktree does not lose
the finding.

The original four traces from `96fc9af` are also preserved under
`.agent-game/tim25-original-96fc9af/`. The moving-head follow-up writes separate
`.agent-game/tim25-moving-head-blocked.json` and
`.agent-game/tim25-moving-head-after.json` artifacts; its evidence is below.

## Actual request and context sequence

The large fixture generates 27 legal 1,000-code-point four-byte Unicode chats
over three cooldown-spaced waves in the opening discussion, then advances the
real engine to its mandatory nomination. The CLI nominates using the observed
legal choice. Eight more legal Unicode chats and this public claim are generated
before the nomination receipt is returned:

> I oppose this government: ask the nominee to explain their last vote.

The claim is entitled event **43**, `eventKey: dialogue-135`. It is absent from
the current observation and action receipt; only its availability is advertised.

### Before: advertised head is not delivery

```text
CLI observe        → GET current → nomination, decision=nominate, head=32
CLI act --choice 0 → POST nominate → accepted, government-discussion, head=43
CLI say ...        → POST chat → accepted, head=44
                    relevant claim present in prior stdout: false
CLI history --limit 10
                   → GET current; GET history after=0 through=44
                   → delivered IDs 1–6, cursor=6, hasMore=true, 9,103 bytes
FAIL Relevant entitled claim must reach CLI stdout BEFORE optional speech
```

In the one-page control, `history` moves before `say`, requests `through=43`,
and still returns only IDs 1–6. The saved foreground walk is
`{epoch:"dialogue-12", cursor:6, through:43}`. Its missing range includes the
claim. No cursor is incorrectly advanced by the CLI; the calling sequence is
insufficient.

### After: bounded recent delivery, then current recheck, then speech

```text
CLI observe        → GET current → nomination, decision=nominate, head=32
CLI act --choice 0 → POST nominate → accepted, government-discussion, head=43
CLI history --epoch dialogue-12 --after 33 --through 43 --limit 10 --max-bytes 12288
                   → GET current; GET history → IDs 34–36, cursor=36
CLI observe        → GET current → same phase/head, no decision
CLI history --epoch dialogue-12 --after 36 --through 43 --limit 10 --max-bytes 12288
                   → GET current; GET history → IDs 37–38, cursor=38
CLI observe        → GET current → same phase/head, no decision
CLI history --epoch dialogue-12 --after 38 --through 43 --limit 10 --max-bytes 12288
                   → GET current; GET history → IDs 39–40, cursor=40
CLI observe        → GET current → same phase/head, no decision
CLI history --epoch dialogue-12 --after 40 --through 43 --limit 10 --max-bytes 12288
                   → GET current; GET history → IDs 41–43, cursor=43, hasMore=false
                    stdout includes eventKey=dialogue-135 and the exact claim text
CLI observe        → GET current → same phase/head, no decision, chat available
CLI say ...        → POST chat → accepted, head=44
                    relevant claim present in prior stdout: true
```

History internally reads current state but outputs a page, so the explicit
`observe` is what delivers a decision/phase recheck to the caller. All four pages
hold `through=43`; the earlier range 1–33 is **omitted**, not marked delivered.
The saved foreground `historyWalk` remains absent. A short-message control
delivers IDs 7–16, including its latest claim, in one 1,542-byte page.

| Unicode recent page | Delivered IDs | JSON UTF-8 bytes |
| ------------------- | ------------- | ---------------: |
| 1                   | 34–36         |            8,600 |
| 2                   | 37–38         |            8,392 |
| 3                   | 39–40         |            8,392 |
| 4                   | 41–43         |            8,560 |

Total history output is 33,944 bytes, with each page under 12,288 bytes.
Individual CLI outputs in these scenarios are also asserted below 15,500 bytes.
The largest non-history output in the Unicode trace is the initial 3,357-byte
observation. A ten-event window can require up to ten pages because whole events
fit individually but byte limits can make pages shorter than their event limit.
It does not require walking the archive. Ten reuses the existing foreground
event limit as a bounded context window; it is not a measured optimal prompt
size, and older strategically relevant claims still require deliberate backfill.

## Hypotheses tested and scope of the fixture

Ranked after the first red reproduction:

1. **Instruction ordering permits uninformed speech.** Confirmed by the
   speech-before-history control, despite an accepted mandatory action first.
2. **A single cumulative page does not ensure recent context.** Confirmed by
   cursor 6 versus head 43; an explicit recent range succeeds without changing
   the CLI runtime or advancing the foreground cursor over an omitted range.
3. **State can change during the history read.** Confirmed by injecting real
   engine transitions while a page is in flight; a delivered current recheck
   stops stale optional work.

Real components are `createSuccession`, `evolveSuccession`,
`observeSuccession`, `inspectSuccession`, production `MatchHistory` entitlement
indexes and byte-bounded paging, request schemas, the packaged CLI, HTTP and
its persistent config/current/history fences. Game phases, chats, decisions,
takeovers and interruptions come from engine commands, not fabricated
observation objects. The history host uses Node SQLite with a small `SqlStorage`
adapter; it does not reproduce history filtering or paging logic in the test.
Original entitlement is frozen before takeover events are appended.

Substitutions: deterministic zero-index random choices and IDs, virtual engine
time, a loopback HTTP host, and scripted message text. The fixture bypasses
Durable Object scheduling, installation authentication, D1, provider generation,
receipt persistence and real-world elapsed deadlines. CLI receipts still come
from successful engine actions. This measures known-decision request ordering,
not an inference-latency SLA. The existing Worker regression separately exercises
installed-package play against the real Worker.

## Recheck and recovery results

| Scenario                                 | Executed result                                                                                                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mandatory nomination                     | `GET current → POST nominate` precedes every history request.                                                                                                                                      |
| Voting opens during first page           | One page, then `observe` exposes the new vote decision; `POST vote` follows before another page or speech.                                                                                         |
| Controller replacement during first page | Real debate/action/grace expiry yields forfeited generation 1 and `private:null`; stop after one page, no chat submission.                                                                         |
| Epoch changes before page response       | Real interruption makes the server return reset metadata; CLI adopts the archive epoch, the script defers speech, and a subsequent foreground page begins at zero.                                 |
| Peer speaks after every page             | Superseding the original single-chat silence case: finish four pages through frozen head 43, acknowledge newer head 47, and speak using the delivered claim. The unread tail remains undelivered.  |
| Fresh model context / reconnect          | Drain foreground history to head 16, clear only the simulated model's prior stdout, invoke a fresh CLI process, and explicitly redeliver the recent window. The foreground walk remains identical. |
| Cooldown                                 | Engine-generated earlier speech sets `nextSpeakAt` in the future; refreshed context does not result in another chat.                                                                               |
| Deliberate silence                       | A completed fresh read leaves speech available; the scripted caller chooses silence and submits no chat.                                                                                           |

## Follow-up: moving-head progress without a quiescence gate

Lead review of `96fc9af` identified that requiring the head to remain equal to T
after every page unnecessarily required a quiet table. A growing head within the
same match/phase/controller/epoch does not invalidate a frozen history prefix.
This section **supersedes** that commit's `new-chat` silence finding and its
remaining-limits statement accepting silence on a continually changing head.
The earlier ordering/backlog measurements and their transcripts remain valid.

A new installed-CLI stress scenario first ran against the unchanged helper from
`96fc9af`, before removing its `current.history.streamHead === through` gate:

```sh
npx vitest run tests/cli-dialogue.test.ts -t 'head grows after every page'
```

Measured **red** in 1.43 seconds:

```text
ready=false pages=1 cursors=[36] frozenThrough=43
page advertisedHeads=[43] peerTimes=[25000] currentHead=44
FAIL Same-scope head growth must not require table quiescence before speech
```

After revising the skill and executable helper, the same command passed in
1.56 seconds. It keeps epoch `dialogue-12` and `through=43` for every history
request. An actual engine-accepted peer chat occurs after **each** of the four
pages, before its explicit current recheck:

| Page | Delivered IDs | Page's advertised head | Peer chat time | Rechecked head |
| ---- | ------------- | ---------------------- | -------------- | -------------- |
| 1    | 34–36         | 43                     | 25,000 ms      | 44             |
| 2    | 37–38         | 44                     | 26,000 ms      | 45             |
| 3    | 39–40         | 45                     | 27,000 ms      | 46             |
| 4    | 41–43         | 46                     | 28,000 ms      | 47             |

Four distinct peers speak after their individual five-second cooldowns, all
within the same government-discussion phase ending at 40,000 ms. The frozen
ten-event window remains **33,944 JSON UTF-8 bytes (33.1 KiB)** across four
individually bounded pages, including the claim at event 43. A preparatory
one-event foreground page establishes cursor 1; that saved cursor remains 1
through the entire recent read and accepted speech. No history query goes
beyond frozen T, despite later availability being visible in both page metadata
and the final current recheck.

The script asserts that the four newer posts' unique text is absent from every
CLI output before speech. It obtains the known claim from the actual delivered
page, then submits this engine-accepted reply:

> You said: "I oppose this government: ask the nominee to explain their last vote." Which prior vote concerns you?

The final recheck advertises head **47**; the reply itself advances the head to
**48**. Events 44–47 are known to be available, but their contents are **not**
known to this caller. The scripted reply demonstrates use of delivered context,
not an LLM choosing a useful response or a new mandatory reply style. Subsequent
bounded passes can read newer availability. Mandatory-decision, match, phase,
epoch, generation, forfeit, terminal and cooldown rechecks remain in effect.

## Verification

### Original patch (`96fc9af`)

Original regression command:

```sh
npx vitest run --no-file-parallelism tests/cli-dialogue.test.ts tests/cli-output.test.ts tests/cli-succession.test.ts tests/cli-worker.test.ts tests/supervisor.test.ts tests/supervisor-native.test.ts tests/supervisor-result.test.ts
```

**63 tests passed across seven files** in 40.8 seconds. This includes the existing
delayed-response, queued-participation, entitlement, terminal/epoch fences,
native child deadlines, installed-package two-game Worker, and supervisor tests.
`npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run build`
also passed. The report has a separate targeted Prettier check because the
repository's format script does not include `docs/`.

The first parallel regression attempt saw extra requests counted as current
reads by the new catch-all fixture and an existing `cli-succession` held-current
case returning active instead of finished. Concurrent local Worker startup
probes are a suspected interferer; the new fixture now accepts only its exact
match routes. The final suite run is serial and both cases pass. No change was
made to the existing concurrency fences/tests. The Worker suite also emits
root-path missing-binding and occasional shutdown `Broken pipe` diagnostics;
its gameplay/archive assertions pass. Those diagnostics are not dialogue
context failures, and the parallel-interference cause was not fully isolated.

### Moving-head follow-up

The focused moving-head scenario was recorded red before the helper/instruction
edit and green afterward. Final follow-up checks passed:

```sh
npx vitest run tests/cli-dialogue.test.ts
npx oxlint tests/cli-dialogue.test.ts
npx prettier --ignore-path /dev/null --check tests/cli-dialogue.test.ts skills/agent-game/SKILL.md docs/evaluation/TIM-25-external-dialogue-context.md
git diff --check
```

**Nine dialogue cases passed** in 4.39 seconds; scoped lint reported no warnings
or errors. The moving-head stress replaces the original single-head-growth
silence test. Production CLI runtime code is unchanged; the original 63-case
regression evidence above is retained without repeating those suites.

## Remaining model limits

This proves the corrected **scripted sequence can deliver** relevant permitted
history before optional speech while preserving immediate known mandatory-action
priority. It does **not** prove an LLM will follow the skill, use a claim correctly,
choose a useful reply, or fit real model/tool latency inside the available phase.
Bounded historical context can omit newer messages even after a fresh current
recheck: their advertised availability does not deliver their content. This
permits conversation grounded in a finite delivered window without requiring
table quiescence or unbounded catchup. State can still change after the final
read; the existing server legality/phase/controller checks remain authoritative.

There is no evidence here for adding a mandatory “reply to a prior claim” prompt.
The prior useful-claim/question/reply guidance is retained, with no new response
style requirement. The ten-event window does not promise complete strategic
memory. TIM-7's fresh house context and TIM-26's real-house concurrency/admission
questions remain distinct from this external execution finding. No real-model
quality or concurrent-inference conclusion is drawn from these scripts.
