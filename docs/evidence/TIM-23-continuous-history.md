# TIM-23 · Continuous bounded reading

## Integration contract

Baseline: `7233eb6`. TIM-23 owns bounded retrieval, authorized historical baselines, reader lifecycle and scroll anchoring. Dossier composition owns chapters, card/portrait/rule rendering and styling. The separately cherry-pickable TIM-18 spec correction is **`4cba978`**; it preserves completed-action context for trailing private emissions. Original `.tim18` evidence remains intact.

The consumer entry points are:

```tsx
import { useSuccessionStory } from './use-succession-story';
import { SuccessionTimeline } from './succession-timeline';
import { useSuccessionMatch } from './use-succession-match';

const match = useSuccessionMatch(initialObservation, { history: false });
const reader = useSuccessionStory(match.view, {
  act: 2, // optional: constrain to an act's source landmarks
  enabled: actTwoOpen, // keep the hook mounted when the chapter is closed
  initial: 'start', // 'latest' for an attached live reading surface
  onReset: match.refresh, // existing authoritative current owner refreshes
});

<SuccessionTimeline
  reader={reader}
  aria-label="Act II record"
  className="dossier-timeline"
  renderRow={(row) => <DossierRow row={row} />}
/>;
```

- `useSuccessionStory` returns `rows`, `model`, `status`, `error`, `following`, `newEvents`, `hasEarlier`, `hasLater`, `after`, `delivered`, `head`, `version`, and `enabled`. Methods: `loadEarlier`, `loadLater`, `follow`, `detach`, `retry`, `rememberAnchor`, `getAnchor`, `seek(eventKey)`.
- `SuccessionTimeline` is a generic chronological wrapper with automatic boundary retrieval, retained-event scroll/focus anchoring, loading/error/retry announcements and the new-activity/live-edge control. `renderRow(row)` returns any React node, including `null` for audit/private rows outside the selected disclosure. It supplies no action/card/chapter design. `scrollRoot="document"` is the default; `scrollRoot="self"` supports a caller-sized internal scroller. `className` and native `style` are caller-owned.
- Keep the hook outside a collapsible panel so `enabled=false` preserves its bounded reading position while cancelling work. Unmount destroys only that reader's Query work. Separate mounted readers have independent keys/cursors; no shared-reader cancellation.
- Rows remain TIM-18 `StoryRow`. The model receives the exact **exclusive-start checkpoint**, never a latest/end frame. Source order and eventKey identity are retained even when row rendering returns `null`.
- Each reader retains a model for at most **128 source events**, with at most **128 incoming events** during replacement. Raw history pages and checkpoints are released after projection. Sliding windows normally overlap by 64 records; evicted history remains server-retrievable in both directions. History requests remain **32 events / 16 KiB**, with a frozen `through` for each operation. No accumulation of all frames or pages.
- Live head growth is availability only. Detached readers retain their anchor and expose `newEvents`; attached readers drain each frozen operation then follow the newly accepted head. Hidden/disabled readers pause automatic network work. Mutation/decision commands remain with `useSuccessionMatch`.

### Caller details

- `useSuccessionMatch(initial, { history: false })` is additive and defaults to the prior behavior when omitted. It disables/releases only the old feed reader, while preserving authoritative acceptance, websocket reconnect, current refresh and command mutation ownership. Use it when the Dossier owns reading through `useSuccessionStory` to avoid duplicate feed requests.
- Keep one hook per chapter mounted outside its collapsible content; `enabled` follows that chapter's disclosure. Use `initial: 'latest'` for live Act II and `initial: 'start'` for a chapter being read from its beginning. `act: 1` freezes at the source landmark immediately before Act II; `act: 2` includes the actual `act-started` return event. Omit `act` for a whole-record reader.
- `rows` is the same array as `model.rows`. `after` is the exclusive start; `delivered` is the successfully delivered end of that selected window, not the available head. `head` is the selected act's available end. `hasEarlier`/`hasLater` describe retrievable history outside the retained window. `newEvents` counts head growth beyond already known/read availability, rather than calling the entire old backlog new activity.
- `status` is `idle | loading | paused | ready | error | reset`. `paused` reflects the active operation's actual Query `fetchStatus`: the generic container announces “Offline. Waiting for connection to load the record.” with `aria-busy=false`, preserving delivered rows. Query resumes the same operation on reconnect; hidden/disposed readers cancel their own paused work. Ordinary read failure retains the delivered rows and offers retry. A source reset/401/403 retires rows immediately and calls `onReset`; only a fresh accepted current observation restarts reading, including a manual refresh that keeps the same epoch.
- `StoryReadingAnchor` is `{ eventKey, cursor, offset, focused? }`. The offset is relative to the viewport for document reading, or the internal root for self scrolling. Scope changes map the opaque event key through `/history-anchor`; they do not reuse an old epoch's cursor. Match A–B–A creates separate lifetimes. The hook keeps only one previous anchor, not a map of every visited match.
- `seek(eventKey)` supersedes this reader's pending work and positions the requested authorized row. Keys outside the selected act or unavailable to this audience produce a recoverable error. `rememberAnchor`/`getAnchor` are primarily for the container; other reading surfaces can supply equivalent behavior.
- A focused retained row is pinned against eviction. Normal scroll/keyboard reading moves the overlapping window; moving focus to the timeline region allows travel beyond a pinned control. Resizing content and toggling the chapter restore the retained anchor. Native Arrow Up/Down and Page Up/Down scroll instantly, avoiding a browser key-scroll animation continuing through replacement; input/editable controls retain their key handling.
- The container handles runs of `null` row renderings by continuing the requested direction, so clipped private/audit runs cannot bounce endlessly between overlapping windows. Source records still reach the model in order.
- Query keys retain the existing `matchReadKey(matchReadScope(view))` prefix plus a unique reader lifetime and operation ticket. Scope retirement remains compatible with the current owner's cancellation, while an individual reader never cancels another reader's work. Each operation releases its Query entry after projection or failure; signal and ticket checks guard both requests and late decoded bodies.

## Authorized checkpoint source

`GET /api/matches/:id/checkpoint?epoch=…&through=…` returns `HistoryCheckpoint2` from `src/shared/history-checkpoint.ts`, decoded by `HistoryCheckpoint2Schema`. It carries `{ protocolVersion: '2', gameId: 'succession', matchId, visibilityEpoch, through, baseline }`. A wrong epoch returns the existing empty `HistoryPage2` reset envelope. `baseline` is a non-actionable historical `Observation2`, a terminal-authorized `ReplayFrame2`, or explicit `null` when saved history is unavailable.

`MatchHistory.checkpointPosition` maps one authorized cursor through `history_streams` and original-controller cutoffs to a canonical event ID. Public readers use the public index; original controllers get their historical entitled prefix followed by the public-only takeover tail. `MatchObject.checkpoint` loads one saved frame at or before that canonical event. No prefix walk, replay of a complete match or latest/final-state seeding is involved. Chat-only gaps reuse the preceding mechanical checkpoint and keep chat/decisions closed; they cannot introduce later resources. Mid-turn facts absent from the canonical checkpoint remain explicitly unavailable in TIM-18.

Live readers receive the public or permitted historical observation. A post-cutoff original controller receives no private hand, including where a preceding saved frame predates the public takeover tail. Terminal readers first verify the archive commitment; after that asynchronous verification, current source authorization/grant revocation is checked again before access. Historical controller metadata cannot grant current access. Existing terminal `/replay` restrictions and opaque epochs remain intact.

Existing `/rounds` gains authorized live index projection, compatible with `RoundIndex2`, so act bounds use actual source landmarks. Canonical round cursors are translated to the recipient's authorized stream and unavailable anchors are omitted. Neither endpoint advances accepted current or delivered history. No wire-version migration, coordinator, house or identity/auth policy changes are required.

### Bounds

| Quantity                         | Bound per reader / operation                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mounted source-row wrappers      | 128 maximum; omitted renderings use no wrapper                                                                                                   |
| Retained source window           | 128 records; incoming replacement at most 128                                                                                                    |
| Selected Query entries           | 1 at a time per reader; 0 after completion/cancellation                                                                                          |
| History page                     | 32 events and 16,384 encoded bytes                                                                                                               |
| Checkpoint envelope              | 34,816 encoded bytes, Effect validated                                                                                                           |
| Concurrent network requests      | At most 2: checkpoint plus one history page                                                                                                      |
| History requests per replacement | Usually 4; at most 128 if byte bounds permit only one event per page                                                                             |
| Other requests                   | One checkpoint per replacement; one index on initialization/act transition for act-bounded readers; one anchor lookup per seek/scope restoration |

The source-model projection has fixed ten-seat resources and at most 128 rows. Model construction temporarily owns the previous model, incoming source window and replacement model; all are bounded independently of total match history. This is a sliding reader rather than an accumulating infinite-query cache.

The existing round-index source enforces its 42-landmark rules bound. Wheel/touch direction at a window edge is observed even when the browser cannot scroll farther, so loading earlier does not depend on producing an additional scroll event at `scrollTop=0`.

`succession-history-data.ts` owns the shared `readAuthorizedHistory(scope, range, signal, maxEvents)` cursor walk used by story and replay selected reads. Frame/checkpoint composition and Query ownership remain at the callers. Wrong-match responses are rejected before reset classification; API and transport error identities are preserved. `HistoryReset` remains available through the existing replay-data export.

## Verification and handoff

Artifacts are preserved in `.tim23/`. Browser fixtures use intercepted local URLs on 6283 with an in-memory Vite build of the actual production hooks/container. Worker tests run local `unstable_dev`, isolated SQLite/D1 and canonical engine actions. No production server, inference provider or hosted deployment is used.

- `tests/succession-worker.test.ts`: two full Worker scenarios cover live public/private checkpoint privacy, sealed-vote stability, zero cursor, live round/return landmarks, terminal epoch replacement/archive parity, loss/return rosters through the checkpoint-to-model bridge, alternate-grant rejection, source grant revocation and preserved pre-takeover versus revoked post-takeover private hands. Existing settlement/receipt assertions continue to pass.
- `tests/continuous-succession-history.test.ts`: canonical Tax/checkpoint bridge, frozen delivery versus moving head, empty/missing baseline, reset/403 retirement and same-epoch refresh, gap/retry, hidden cancellation with late bodies, independent readers and canonical act bounds.
- `e2e/continuous-story.spec.ts`: actual mounted hook/container traverses all 2,048 canonical messages plus mechanical events forward and backward beyond retained cache; checks eviction/revisit, Query cleanup, narrow keyboard/focus and prepend geometry, chapter toggle, live growth, hidden visibility handling, retry, document scrolling, omitted rendering gaps, A–B–A, independent readers, opaque epoch restoration and a held command receipt after newer authoritative current.
- `e2e/query-lifecycle.spec.ts`: all 23 existing acceptance/selected-read/command lifecycle checks passed, including reconnect and late command outcomes after takeover/unmount.

Final results: **45 focused/model/Worker checks** (26 story, 9 continuous-reader, 4 existing stream, 4 indexed-history, 2 full Worker scenarios) and **30 browser checks** (7 continuous reading, 23 existing Query/current/command lifecycle) passed. All three TypeScript projects, whole-repository Oxlint and CLI/Vite build passed. Scoped Prettier and diff whitespace checks passed.

The full forward/backward browser traversal visited **2,054 unique source records**: 2,048 real engine messages and six public mechanical records. Peak mounted source rows: **128**. The traversal used **63 selected windows / 252 history-page requests / 63 checkpoint requests**; maximum actual history response was **10,774 bytes**. Query entries returned to **zero** after reads. The retained prepend anchor moved from **−43 px to −43.375 px**, a **0.375 CSS-pixel** browser rounding difference; the opaque key was identical. A separate document-scroll test retains the actual focused row through prepend. The omitted-rendering test crosses a 601-record gap in both directions without bouncing requests. The reader transport also rejects an in-flight replacement if scrolling to the opposite edge would evict the newly visible anchor.

Authoritative final artifacts: `.tim23/worker-checkpoints.json`, `.tim23/final-tests.json` (initial eight reader checks plus the other 34), `.tim23/reader-final.json` (all nine final reader checks), `.tim23/browser-results.json`, `.tim23/browser-complete.txt`, `.tim23/typecheck.txt`, `.tim23/lint.txt`, `.tim23/build.txt`, `.tim23/format.txt`. Earlier failure/probe logs remain for diagnosis; `.tim23/README.md` identifies the final set.

The coordinator owns integration into the actual Dossier route. UI composition should consume this contract and supply `renderRow`; `main.tsx`, `succession-match.tsx`, global CSS, visual cards and package/lock files are outside this change.
