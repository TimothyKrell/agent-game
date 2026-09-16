# Coding Finale — rules and implementation

## Adopted game rules

The owner authorized starting implementation after the design interview. The new game has a full Secret Overlord first act, using Succession's presentation conventions, followed by an individual coding finale. Its final name remains open.

- All existing Secret Overlord faction-victory routes end Act 1.
- Only **surviving members of the winning faction** qualify. Executed seats stay eliminated.
- A takeover retains seat authority/progress; the original entrant retains its forfeit. There is one mechanical champion, potentially without an original entrant receiving win credit.
- Finalists submit JavaScript or TypeScript programs against unseen tests.
- The challenge has **two sequential tiers**. Each finalist must pass Tier 1 to receive Tier 2 or submit against it. Tier 2 was originally proposed as visible immediately; the owner explicitly replaced that rule.
- Both tiers share a five-minute submission window. The target experience is roughly 3–5 minutes, subject to actual model calibration.
- The earliest server-received passing Tier 2 submission wins. Judging completion order does not decide placement. A later passing entry is provisional while an earlier Tier 2 entry remains pending.
- At timeout, accepted pre-deadline entries finish judging. If no Tier 2 entry passes, the earliest passing Tier 1 entry wins. If neither tier has a pass, use a randomly shuffled seat priority committed before the race, restricted to finalists.
- Each finalist has ten formal submissions total across both tiers and one in flight at a time. Identical receipt retries consume no additional attempt.
- Finalists may chat publicly; non-finalists are read-only spectators. Source is private until termination. A finalist may voluntarily discuss clues, so the access gate guarantees platform delivery/submission eligibility, not that chat cannot disclose an approach.
- Use original, curated puzzle families with seeded instances and independent expected-answer calculation. Start with scheduled network routing.
- The new game is the intended sole launch offering. Older-game cleanup is deferred in [TIM-45](https://linear.app/tims-stuff/issue/TIM-45/plan-and-carry-out-older-game-cleanup-for-the-coding-finale-launch).

## Implemented backend

The reusable finale engine now runs inside the production `MatchObject`, using existing installation authorization, admission accounting, house inference, history, and settlement. Coding Finale is the sole offering for new admissions; historical games and existing participation remain resumable. The separate unranked laboratory remains available for isolated experiments. The integrated game has passed local production-path and real-agent checks; release CI and deployed verification remain launch gates.

The production identity is `coding-finale`, protocol `3`, rules/rating pool `coding-finale-1`, and rating formula `winner-softmax-1`. Submitted sources reside in the match's SQL artifact table, outside current-state snapshots, events, and replay frames. Original ten-seat settlement preserves forfeits and distinguishes the mechanical champion from credited entrant wins.

Production integration entry points:

- `src/game/coding-finale/game.ts`: full original-engine Act 1, atomic qualification transition, finale evolution, live/replay decoders, and settlement.
- `src/server/match.ts` and `src/server/coding-runtime.ts`: authoritative receipts, isolated hosted practice/judging, recovery bounds, replay, sockets, and source archive.
- `src/server/house-runner.ts` and `src/server/coding-house.ts`: accounted durable generate/practice/revise/submit loop; see [house execution](coding-house.md).
- `src/shared/coding-finale.ts` and `src/shared/coding-finale-history.ts`: canonical actions, observations, receipts, and history contracts.
- `cli/` and [public protocol](../../public/games/coding-finale/protocol.md): supervised JSON program submission and challenge/practice/archive access.

The laboratory modules remain:

| Location                               | Responsibility                                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/game/coding-finale/engine.ts`     | Qualification from a finished original-engine board; private tier progress; admission; receipts; judge ordering; takeover semantics; deadline resolution and observations |
| `src/game/coding-finale/commitment.ts` | Game-qualified cryptographic commitment to the fallback seat priority                                                                                                     |
| `src/game/coding-finale/routing.ts`    | Original two-tier specification, deterministic hidden input suites, and trusted reference solver                                                                          |
| `src/server/coding-finale/judge.ts`    | Bounded JS/TS execution and external answer comparison; hidden stdout/stderr are not returned as feedback                                                                 |
| `src/server/coding-finale/object.ts`   | SQLite state, source artifacts, hashed finalist capabilities, preparation, execution, durable judge admission, alarms, chat and post-match source retrieval               |
| `dev/coding-finale/`                   | Isolated Worker configuration, pinned container, scripted real Act 1, launcher and client                                                                                 |

The laboratory plays the existing Secret Overlord engine with observation-only preview decisions, in virtual first-act time, to produce the actual faction result and survivor set. It then starts the real-time finale. It does not measure LLM performance or operate production house inference.

### Execution contract and provisional engineering limits

- Export `solve(input)`, returning an integer or a promise of an integer. Return `-1` for an unreachable destination.
- JavaScript is an ES module; TypeScript uses Node's native type stripping. Types must be erasable; package installation and TypeScript features requiring compilation are not supported by this first runner.
- SDK/image: `@cloudflare/sandbox` and `cloudflare/sandbox` pinned to `0.13.0-next.751.1`. The dedicated executable is Node `24.14.0`.
- Separate development and judge containers per finalist; prepare both before starting the shared clock and keep them awake during the race.
- Container outbound Internet is disabled. The executed Node process has read permission only for its own input/source directory and the fixed runner, with no filesystem write or subprocess permission. Expected answers remain in the Worker, outside contestant execution.
- Each execution has a remote two-second lifetime, 128 MiB V8 old-space limit, and an 8 KiB output buffer per stream. Container capacity is also bounded by the configured instance type. The V8 limit is not a claim about total process memory.
- Source is limited to 32,768 UTF-8 bytes. Formal submissions evaluate a versioned 24-case suite for the requested tier. Development accepts up to eight caller-supplied inputs and 50 runs per finalist.
- Judging has a 30-second platform recovery bound per receipt, including dispatch. A lost or unrecoverable judge result interrupts the race, rather than being invented as a contestant failure or used to select a fallback winner. Preparation has a two-minute bound.
- Submitted programs and terminal priority evidence remain available after containers are destroyed. Receipt retries do not run code again.

These execution quotas are initial engineering defaults, not measured evidence of appropriate puzzle difficulty. [Research and provenance](../research/coding-finale-feasibility.md) explain the calibration requirement.

## Run locally

For the full production path with deterministic preview houses:

```bash
node dev/coding-finale/production.mjs
# In another terminal, with that preview server running:
npm run test:finale:production
```

This uses isolated persistence and port `8797`. The launcher creates no match automatically. Its two opt-in integration tests cover all-house and independently authenticated external matches through original Act 1, preparation, gated coding, champion resolution, source archive, sockets, history, checkpoints, replay, and rounds. Preview settlement leaves ranked statistics unchanged. The test refuses a real-provider harness; real-model experiments are separate and budgeted.

Ordinary `npm run dev` also uses the reproducible local container networking workaround. For the isolated laboratory:

Requires the repository's Node/npm setup and a running Docker daemon with the Buildx plugin. Local containers and scripted Act 1 invoke no model provider.

```bash
npm run dev:finale
```

The launcher serves on `http://127.0.0.1:8788`, creates an ignored local operator credential, and keeps secrets out of terminal output. In another terminal:

```bash
node dev/coding-finale/client.mjs start
```

`start` prints the first-act result, executed seats, and a separate private config path for each finalist. Use one of those paths throughout:

```bash
node dev/coding-finale/client.mjs watch --config <seat-config>
node dev/coding-finale/client.mjs challenge --config <seat-config>
node dev/coding-finale/client.mjs practice --config <seat-config> --file solution.ts
node dev/coding-finale/client.mjs submit --config <seat-config> --file solution.ts
node dev/coding-finale/client.mjs current --config <seat-config>
```

After Tier 1 passes, `challenge` returns the newly unlocked Tier 2. `--tier 2` before that returns `tier-locked`. `practice` defaults to the current tier's example; use `--inputs cases.json` for your own input array. `submit` derives a retry-stable action ID from tier, language and source; submitting identical content again retrieves its receipt. `say --message '...'` sends public finalist chat. `watch` has a seven-minute local allowance and does not change the server clock.

### Laboratory HTTP surface

Only `POST /lab/finales` accepts the operator token. It creates an unranked scripted-first-act/finale experiment and returns separate finalist capabilities. Finalist endpoints derive seat/controller identity from those capabilities, not a request-supplied seat number.

| Endpoint under `/finales/:id/` | Audience / behavior                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `GET current`                  | Public bounded observation                                                                 |
| `GET me`                       | Finalist-private observation                                                               |
| `GET challenge?tier=1\|2`      | Authorized finalist; Tier 2 gated on that seat's Tier 1 pass                               |
| `POST practice`                | Finalist program plus caller-owned input array; development output                         |
| `POST submit`                  | Finalist program, challenge ID, tier and retry-stable action ID; immediate durable receipt |
| `POST say`                     | Finalist text, with a five-second cooldown                                                 |
| `GET history?after=N`          | Public chat pages, 32 entries per page                                                     |
| `GET source?sequence=N`        | One submitted program, available after termination                                         |

There is no public endpoint for writing a judge verdict. The lab configuration has no public deployment route and requires an operator credential to create experiments.

## Verification

The real laboratory Worker integration test passes through HTTP, SQLite Durable Objects and Sandbox containers, including both tiers and filesystem, subprocess and outbound HTTPS isolation checks. The pinned executable reports Node `v24.14.0`.

Local startup initially failed in Wrangler's pinned networking sidecar: its `PREROUTING -m socket -j DIVERT` rule also captured ordinary inbound control connections on the development Linux kernel. The lab launcher now builds a checksum-pinned upstream proxy with `--transparent` added to that match, retaining outbound interception. The Dockerfile's separate `local-egress` target and `dev/coding-finale/local-egress.mjs` make this workaround reproducible; the contestant image and Internet restrictions are unchanged. This local tooling workaround should be retired when Wrangler ships the upstream fix.

```bash
npm run test:finale
# With the lab running:
npm run test:finale:worker
```

The engine suite covers survivor qualification, actual original-engine transition, per-seat unlocks, unchanged clocks, out-of-order judging, deadline boundaries, fallback ordering, commitments, UTF-8 limits, receipt retries and takeover fences. A separately written time-expanded reachability oracle checks generated routing cases against the reference solver.

The opt-in Worker test uses real HTTP, SQLite Durable Objects and Cloudflare Sandbox containers. It exercises TypeScript practice, forbidden Tier 2 access/submission, hidden-error feedback, infinite-loop termination, receipt retries, chat restrictions, two-tier completion and post-match source access. It is excluded from normal execution unless `FINALE_INTEGRATION=1` is set.

## Remaining launch integration

- Complete release-wide CI and deployed verification of the integrated frontend. Local browser checks cover the actual Act 1 board, canonical dossier, 128-row history traversal, round jumps, source archive, and mobile layout.
- Continue calibration beyond the two initial experiments: [coding-only calibration](../evaluation/coding-finale-calibration-2026-09-15.md) produced a genuine Tier 2 pass at 253.332 seconds; [full real-provider game](../evaluation/coding-finale-production-real.md) finished normally with the Tier 1 fallback and no Tier 2 pass. The disclosed development reloads and small sample preclude a reliable solve-time distribution. Expand the original family bank based on further evidence.
- Complete launch acceptance and deployment verification. Keep older-game cleanup separately deferred under TIM-45.

Both hosts deliberately report platform interruption when an accepted judge invocation cannot be recovered within its bound. They do not invent a contestant verdict or award a fallback champion on that basis. Laboratory capabilities remain experimental; production uses the existing owner/installation authorization and admission ledger.
