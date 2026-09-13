# G7: actual legal long-path engine and installed supervisor

Date: 2026-09-13. Test: `tests/succession-long-path.test.ts`. This closes the actual-engine long-path evidence gap beyond the earlier injected 260-minute supervisor timeline. It does not change the already-adopted D14 operational numbers.

## Method and scope

The test creates a genuine Succession match with the current `createSuccession` engine and evolves it exclusively through `evolveSuccession` commands. It never sets engine phase, resources, cards, round counters, or results directly. Its deterministic seed is **7**, initial time is **1,800,000,000,000 ms**, and commitment salt is 32 bytes containing 7. Ten distinct external entrants have `house: false` and distinct owners. A neutral preview snapshot retains the descriptor's **normal, unscaled timing**; no seat uses house authority, no model runs, and no rating is applied.

Act 1 uses `previewSuccessionAction` on each required seat's own `observeSuccession` projection. Every selected action is checked against that observation's actual legal options. Discussion advances to its real engine deadline. Required choices arrive one second into their window, with concurrent choices sharing that timestamp. Act 1 runs from its initial deal through its actual faction ending and atomic Act 2 transition.

Act 2 follows this legal pattern for every one of its 120 turns:

1. Wait all **10 seconds** of discussion.
2. The active seat selects the actual legal **theft** choice targeting the next seat clockwise.
3. All **nine** eligible action-claim responders select their actual legal **pass** choice.
4. The target selects the actual legal **Thief block** choice. Claiming this block does not require possession; it remains unchallenged.
5. All **nine** eligible block-claim responders select their actual legal **pass** choice.

Each of the four required windows submits at **deadline minus one millisecond**, or 29,999 ms after opening. Every responder in a sealed window uses that same virtual timestamp, so concurrent responses do not become nine sequential 30-second waits. The test verifies the exact eligible responder set for both challenge windows on every turn.

All 120 thefts are blocked. After every mutation, engine integrity checks and resource comparisons verify all ten seats retain their Act 2 starting coins and both influences. No influence loss, coin transfer, grace, takeover, forfeit, house-controller substitution, or round 13 occurs. The real cap resolver produces the unique champion, and the salted commitment is verified.

## Measured real-engine trace

| Measure                                     | Result                                              |
| ------------------------------------------- | --------------------------------------------------- |
| Act 1 duration                              | **494,000 ms — 8m14s**                              |
| Act 2 duration                              | **15,599,520 ms — 4h19m59.520s**                    |
| Complete two-act duration                   | **16,093,520 ms — 4h28m13.520s**                    |
| Act 1 accepted required submissions         | **104**                                             |
| Act 2 accepted required submissions         | **2,400**                                           |
| Act 2 turns / discussion windows            | **120 / 120**                                       |
| Act 2 required windows                      | **480**, including **240** sealed challenge windows |
| Survivors at the cap                        | **10**                                              |
| Coins for seats 0–9 throughout Act 2        | **2, 2, 2, 3, 2, 3, 2, 2, 3, 3**                    |
| Influence for every seat throughout Act 2   | **2**                                               |
| Unique winning seat                         | **3**                                               |
| Decisive cap comparison                     | **Priority**, among tied surviving bonus recipients |
| Canonical engine events generated           | **6,258**                                           |
| Largest measured seat-0 current observation | **4,624 bytes**, below 14,336 bytes                 |

The Act 2 duration is the measured engine-clock result of:

`120 × (10,000 + 4 × 29,999) = 15,599,520 ms`

The full-game duration is deliberately **not forced to 260 minutes**. Act 1 contributes its actual 494,000 ms before Act 2 begins.

For reproducibility, SHA-256 over each ordered `appendedEvents` array serialized with `JSON.stringify`, followed by one newline per initialization/evolution, is:

`1a1962e6074dbf26555d703e3ef125a529cab4730bcf0e6f5418f0568548fda0`

## Actual installed supervisor integration

The fixture first precomputes the legal engine trace once, retaining timestamped **real seat-0 engine observations** after its actual commands. Live history-head metadata is derived from generated public/seat-0 events; terminal metadata announces the complete generated archive. No phase or result is fabricated for supervision.

It then runs `scripts/package-cli.mjs`, installs the resulting versioned CLI archive using `npm install --ignore-scripts --no-audit --no-fund` into a new `/tmp/opencode` directory outside the checkout, and imports **that installed package's supervisor implementation**. Source imports for the supervisor are type-only. Both profiles consume the same immutable legal trace.

The parent receives injected virtual time and a fake arena transport. A current read returns the last actual engine observation at or before that virtual time, including at every child-slice boundary. Injected children checkpoint usage and their persisted session identity, then advance time to the earlier of their actual parent-bounded slice deadline or the engine's real finish. These children do not alter the trace. The test checks that every recorded slice phase ID belongs to the actual engine trace and that the first-child config already contains the real participation identity.

| Runtime profile                             | Installed supervisor result                                                                     | Elapsed match time | Child invocations | Synthetic accounted usage |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------ | ----------------- | ------------------------- |
| **Adopted default**; no runtime override    | `client-stopped / runtime-exhausted`; last server status **active**; original-agent credit null | **120 minutes**    | **12**            | **$0.12**                 |
| **Explicit 300-minute test-only allowance** | Server **finished**, real `round-cap` reason, winning seat **3**                                | **4h28m13.520s**   | **27**            | **$0.27**                 |

Both profiles use the existing **$2 Claude harness-accounting limit**. Each synthetic invocation reports $0.01, and each subsequent reserved grant is checked against `$2 − prior verified usage`. Those inputs are arbitrary zero-cost test accounting, not model-cost estimates. The final 300-minute-profile invocation lasts **8m13.520s**, ending at the actual engine result rather than consuming a complete artificial slice.

This confirms the adopted 120-minute client resource profile can honestly stop during a legal active game, while an explicit larger allowance preserves supervision through the real cap with more than 26 invocations. It changes neither game rules nor monetary authorization. The server continues after a client stop; a real missing external controller could later forfeit.

## Evidence boundaries

- No real model, provider inference request, paid trial, deployment, or budget increase occurs.
- The game mechanics and observations are from the actual full two-act engine; the supervisor is from the installed archive. Time, child execution, and arena transport are injected.
- This is not a real Worker HTTP/WebSocket, database persistence, or production-provider test. Those integration gates are separate.
- No chat, network delay, grace, recovery, or provider latency is added. The path is nevertheless legal and deliberately delays every Act 2 required window until just before its deadline.
- The event count/digest demonstrates the generated engine trace; this fixture does not claim paged archive delivery, replay seek coverage, or the large-chat transport/resource gate. The byte measurement covers this trace's seat-0 current observations only, not every possible maximal observation.
- This is one seeded adversarial path, not a strategy distribution or universal duration bound. The separate 250-game pacing evidence and the earlier native fake-executable deadline tests remain complementary.

## Reproduction and checks

```sh
npx vitest run tests/succession-long-path.test.ts
npx oxlint tests/succession-long-path.test.ts
npx prettier --check tests/succession-long-path.test.ts docs/evidence/succession-long-path.md
npx tsc --noEmit
```

The first run passed both installed-supervisor profile tests and all real-engine trace invariants, taking about 1.9 seconds of real test-run time. Scoped lint passes. Repository typechecking also surfaced unrelated event-data type errors in `src/client/match-feed.tsx`; these are outside this task's two-file ownership and were reported separately. The test prints `SUCCESSION_LEGAL_LONG_PATH` metrics and `SUCCESSION_LEGAL_SUPERVISOR` results, including every real slice phase ID, for reproducible comparison.
