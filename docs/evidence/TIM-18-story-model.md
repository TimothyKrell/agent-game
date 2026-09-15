# TIM-18 · Canonical bounded story model

## Interface and ownership

`src/client/succession-story.ts` exports **`buildSuccessionStory(window): StoryModel`**, a pure, bounded projection for the approved reading-only C / Dossier. Types live in `succession-story-types.ts`; extensible canonical payload decoding in `succession-story-events.ts`; all **36** rule terms and lossless text annotations in `succession-story-rules.ts`.

The model consumes authorized `AuthorizedEvent2` records and an exact `ReplayFrame2` or `Observation2` baseline. It does not fetch, own Query caches, change live acceptance, infer authorization, or recreate the game engine. Production imports contain no prototype modules, fixtures or JSON. The retained guide remains available with all 20 scenarios.

```ts
import { buildSuccessionStory } from './succession-story';

const story = buildSuccessionStory({
  scope: { matchId, visibilityEpoch },
  after, // exclusive start of this retained window
  through, // frozen inclusive requested end
  events, // in delivered source order, at most 256
  baseline: frameAtAfter, // /replay?epoch=…&through=after, NOT the end frame
  current: acceptedCurrent, // optional: independent chapter/outcome facts only
});

for (const row of story.rows) {
  // row.key: stable match + opaque eventKey; suitable for React/reading anchors.
  // row.source: epoch-local cursor plus eventKey for retrieval.
  // row.position: act, round, source order and original event timestamp.
  // row.text: exact source text; speech is never rewritten or summarized.
  // row.fact: discriminated mechanical payload for action/status rendering.
  // row.actor !== row.turnOwner for challenge/block/loss choices.
  // row.affected: event-time before/after resources, cards and controller state.
  // row.remaining: immediate historical roster after execution/influence loss.
}
```

`after` is the first retained event ID minus one, **not** the reader's latest delivered cursor if older records are retained. Matching match/epoch and exact baseline cursor are enforced. Duplicate/out-of-order/out-of-range events and windows over 256 are rejected. Missing baseline, missing records and unsupported/incomplete legacy payloads produce explicit issues and unavailable temporal context. Records are never sorted, truncated or joined across a gap. `delivered` distinguishes the supplied end from the requested `through`; `end` describes that delivered position only. All inputs are copied so later caller mutation cannot alter previous output.

The caller continues using `SuccessionCurrent` for authoritative live acceptance and a separate `SuccessionHistory` per reader for delivered cursors, frozen-through requests, 256 retained records and 32-event / 16 KiB pages. No browser accumulation of all historical frames is required or supported.

## Facts for downstream components

- **`StoryValue<T>`** is `known`, `derived` (with source references and a mechanical rule), or `unavailable` (with a reason). Known `null` is distinct from an unknown actor/target. The derivation text is diagnostic provenance, not editorial copy for the timeline.
- **`StoryFact`** covers Act I nomination, individual entitled ballot, published election, policy/chaos/tracker, private policy selections, investigation and its private result, special election, execution, cleared Executor, veto request/response and faction result. `executivePower` is checkpoint-backed or explicitly derived from the ten-seat board.
- Act II facts cover the six declarations, claims, paid costs, sealed entitled reactions, published responses/selected challenger, proof/disproof, block, public coin updates, chosen capability loss, exchange draw/completion, turn resolution, takeover, cap evidence, victory and interruption. **Veto remains an Act I mechanic.**
- **`action`** relates subsequent rows to the actual actor/action/target/payment and, when the declaration is in the window, its exact source reference. Response maps come only from published `challenge-resolved` records; entitled `reaction` rows remain private/archive.
- **`affected`** includes directly involved seats even when their balance does not change. Payments apply at declaration, coin effects use published absolute balances, and lost capability cards remain separate from proof/replacement. No result is inferred from the richest or last displayed seat.
- **`remaining`** captures the roster immediately after each loss/execution, with source-linked identity and life state. Later elimination, resurrection or current snapshots cannot rewrite it. With an incomplete life baseline it remains unavailable, rather than presenting a partial roster as complete.
- **`chapters`** contains independently source-linked faction result, final tracks when supplied, all ten return/bonus rows, individual outcome and interruption. Actual recorded bonuses yield **3 coins for the winning faction and 2 for the losing faction**; all ten get **2 fresh influence**, including executed seats. `returnedAfterExecution` marks only the recorded executed seats.
- **`StorySeat.entrant`** is the original agent/owner/name/original-house identity. `controller` separately records house authority, generation and forfeit. Replacement profile identity is unavailable because the wire does not supply it. The outcome names the mechanical winner and explicitly derives original-entrant `win` or `forfeit-loss`; no runner-up is awarded a substituted win.
- **`storyRules` / `StoryRule` / `storyText(text)`** provide the closed 36-term vocabulary, source-grounded rule text and exact inflection-preserving segments. An icon map can `satisfies Record<StoryRule, ReactNode>` without a generic fallback. `storyRuleSource` points to the production Succession rules.

Rows are canonical granularity, with exact dialogue interleaved in source order. There are no editorial headings, consequence stories, “Why” strings, stepping, playback, slider or dropdown state in this interface.

## Visibility and historical cards

Authorization is upstream. The model accepts only the records actually delivered to the caller. It never uses a public/private switch to obtain or invent private facts. Known private event names are marked `private` for live/seat windows and `archive` for a supplied replay frame or terminal current; unknown event visibility stays unavailable. The terminal/current signal only labels already-authorized records.

Hand and role values carry their own visibility independent of the containing row. A public action row can include an entitled private/archive hand in `affected`; UI components must honor that nested visibility and the owner's archive-hand disclosure preference. A claimed capability is **never** converted into a held capability. Ordinary public execution reveals no role; the subsequent canonical Act I result records Overlord execution when applicable.

Cards are sourced from the exact baseline or authorized deal/hand-update/draw record. Proof, loss and exchange invalidate a stale hand until the next authorized hand record. A proof is not a permanent loss. The public loss event supplies capability, not its opaque ID, so the model does not choose between identical copies. An eliminated hand is empty. `exchangeDraw` contains the two drawn cards; observation baselines expose a combined exchange pool, so the adapter separates it from the simultaneously supplied held IDs. Archive frames already supply the draw buffer separately. Audit records remain typed archive facts, and are not replayed backward into earlier hands.

## Exact existing source support and narrow gaps

1. **Terminal checkpoint support exists.** `src/server/match.ts:saveSuccession` persists `replay_frames` for non-chat events and the initial cursor. `replay()` selects one checkpoint at/before the exact canonical cursor and returns `ReplayFrame2`. Chat does not mutate the game board. `src/game/succession/replay.ts` projects historical hands and exchange buffer at that checkpoint. TIM-23 can fetch a baseline at `after` through the existing endpoint without a wire change.
2. **The established reader's frame is at the end.** `src/client/succession-replay-data.ts:replaySliceOptions` currently fetches a selected/end frame plus a preceding 32-event window. That end frame must not be handed to this model as the baseline. TIM-23 owns fetching the correct start frame and continuous bounded windows; TIM-18 changes none of that ownership.
3. **Live historical checkpoints are not exposed.** `replay()` rejects nonterminal audiences. An exact previously delivered observation can seed a matching live window, but a newly fetched current observation cannot seed an earlier tail. A fresh mid-match historical reader therefore has honest unavailable deltas/rosters until canonical in-window facts restore them. A historical live/public checkpoint endpoint would require separately scoped backend work.
4. **Mid-turn causal metadata is incomplete in `ReplayFrame2.board.pending`.** It supplies original actor/action/target/claim/payment/block, but no declaration eventKey, selected challenger/loss seat or loss continuation. When those events fall outside the bounded window, the declaration link and loss reason remain unavailable. The actual `influence-lost.seat` is still correctly attributed. The public phase `activeSeat` is never substituted for a hidden selected losing seat.
5. **Resolution/card granularity is source-limited.** There is no standalone public action-result or target-pass event. The model derives applied/blocked/cancelled outcomes from the available challenge, coin, loss, exchange and turn-ending facts; otherwise resolution stays unavailable. Public proof does not supply replacement identities; the next entitled hand update does. `finished` includes the winner and cap evidence, but omits the Act I summary; in a baselineless clipped finish, its typed row retains the winner even when a complete chapter outcome is unavailable.

These are source limitations rather than missing rule implementations. No backend wire, shared history contract, Query/live owner, `main.tsx`, CSS, primitive or dependency changes are included.

## Verification and evidence

Focused tests use actual `createSuccession` / `evolveSuccession` emissions, actual event checkpoints and explicit public/seat/archive projections of canonical visibility. They cover all four Act I endings, both execution cases and return, direct Act I powers/veto, exact dialogue, all six actions, claim disproof and proof replacement, selected loss actor versus turn owner, private Exchange/public omission, paid cancellation, failed Guard double loss, all three cap criteria, takeover/forfeit winner credit, interruption, missing/gapped/legacy input, event-time mutation independence and epoch/key stability. Two deterministic complete two-act trajectories compare affected public facts with engine checkpoints at each event.

The retained TIM-6 capture is **supplemental test-only evidence**, not the sole implementation test and not a production import. Its 416 exact quotes and all nine historical elimination rosters are checked. The independent loss-window fixture explicitly seeds public influence from preceding recorded losses and immutable entrant identity, never final life/hand state. No prototype adapter is imported. Source hashes, actual capture counts/rosters and verification output are retained under `.tim18/`.

**Final local verification: 24 focused tests pass; all three TypeScript projects, full repository lint, CLI/Vite production build and scoped formatting pass.** Production-asset scans contain none of the checked capture/dev-guide markers. Commands/results are retained in `.tim18/README.md` and the accompanying output files. This change verifies a pure model and its production build compatibility; it does not claim browser layout/interaction, TIM-23 network pagination, or hosted-runtime integration acceptance. Those belong to downstream component/integration work.
