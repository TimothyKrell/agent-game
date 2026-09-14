# TIM-8 — focused frontend seams

**Proposal for the next implementation issues; source baseline `c74b915`, 2026-09-14.**

## Decision and delivery order

1. **TIM-13:** extract shared UI, owner and Secret Overlord modules using the existing flat, kebab-case `src/client` convention. Keep rendering and request behavior intact during extraction.
2. **TIM-10:** add cancellable transport and Query for the **Succession replay HTTP slice**, then move the existing Succession decision command's pending/error lifecycle to a Query mutation. Connect Query read retirement/invalidation to accepted live state. Remove the duplicate Secret Overlord initial fetch by passing MatchRoute's decoded observation to its hook.
3. **TIM-11:** add the Tailwind/shadcn foundation after the shared seams land and the design's tokens/controls are agreed. Validate the cascade change separately from the first styled replay controls.
4. **TIM-23:** use the bounded read seam to deliver continuous, automatic timeline loading, with revisiting of evicted ranges. Its UX is not an implicit consequence of installing Query.

Query owns selected HTTP results; **`SuccessionCurrent` owns accepted live state and `SuccessionHistory` owns a reader's delivered cursor**. Keep API Schema decoding, protocol negotiation, structured errors and stream validators. Do not use TanStack DB for this slice. The [research note](../research/frontend-modernization-options-2026-09-14.md) contains versioned primary sources, compatibility findings and the isolated Query experiment.

## State ownership

| State | Owner after the selected slice | Invariants for callers |
| --- | --- | --- |
| Current URL, navigation and page-local game choice | Existing `navigation.ts` / `game-selection.tsx` | `gameId`, `standingsGame` and `playGame` remain independent. Preserve unrelated query keys/hash and neutral shared-navigation destinations. Browser back/forward remains supported. |
| Bootstrap and public rankings/profile reads | Extracted `use-load.ts` initially; bounded later Query conversion described below | App bootstrap is independent of a selected statistics pool. A failure in default Secret Overlord statistics must not hide healthy Succession statistics. |
| Owner identity, roster, installations, queue participation | `owner-dashboard.tsx` reads server data independently of selected pool statistics | Game choice cannot change or cancel participation, lose draft inputs, collapse onboarding or clear pairing selection/approval. Queue truth comes from the server, never the stats selector. |
| Owner draft, chosen competitor, approval feedback, open setup | Owner module local React state / existing native details state | Reset on a genuine owner/session change; preserve through a pool choice. Pairing status from the server is not inferred from selecting an agent. |
| Current Secret Overlord observation | `use-secret-overlord-match.ts` | Protocol-1 packet decoder and cursor/reset semantics remain specific to that game. Hook owns socket lifetime and merged event history. |
| Current Succession observation | `use-succession-match.ts` + `SuccessionCurrent` | Only `accept` can replace the view. HTTP refreshes and action receipts use a captured revision ticket; sockets use connection-generation fencing. Preserve epoch, terminal, act, controller, generation and forfeit checks. |
| Socket connection/error/backoff/heartbeat | Game-specific transport hook | A socket opening is not an accepted update. Query's online status does not mean the socket is connected. Cleanup closes the socket, cancels timers and fences late callbacks. |
| Succession current history window | One `SuccessionHistory` instance per live/full-history reader | 256 retained events; frozen `through`; only validated page `cursor` advances delivery. Head growth is availability, not delivery. |
| Succession replay frame + selected event window, rounds, archive anchor | Query through `succession-replay-data.ts` | Correlated frame/window for one match, audience, epoch and requested cursor. Historical data is non-actionable. Current view and terminal champion are never replaced by a replay frame. |
| Requested/last-displayed replay cursor, playing/paused, debounce | `use-succession-replay.ts` | These are local reading choices, not server data. Keep 80ms seek debounce, 700ms playback pacing, pause on hidden document and no advance until the requested frame is ready. |
| Reading anchor, following, folds, filters and scroll geometry | Existing `MatchFeed` / `FeedReadingMemory`; successor owned by TIM-23 | Preserve opaque `eventKey` anchor across epoch expansion via `/history-anchor`. Stream ID is not a cross-epoch identity. Loading never silently sets following to true. |
| Decision request lifecycle | Query mutation inside `use-succession-match.ts` | One pending command, no automatic replay/retry, same phase/decision/action IDs. Receipt acknowledgment may survive rejection of its older snapshot. |
| Motion, focus and DOM measurement | Existing `motion.tsx`, layout effects and control primitives | Effects remain appropriate for these external systems. Query does not own animation or scroll state. |

Source anchors: `main.tsx:98–175,540–580,959–1053,1710–1805,2263–2470,2677–2740`; `succession-stream.ts`; `use-succession-match.ts`; `succession-replay.tsx`; `game-selection.tsx`; `match-feed.tsx:28–71`. All refer to the merged baseline, not pending page-local work.

## TIM-13: exact first extraction

Use **feature-prefixed flat modules** alongside the existing Succession files. Put only genuinely reused, domain-light presentation modules in `src/client/ui/`. Retain relative imports. Import direction is page/container → feature hooks/display → transport/shared schemas; shared UI never imports `main.tsx` or a feature container.

| Location | Move from current source | Small interface / ownership |
| --- | --- | --- |
| `src/client/ui/link.tsx` | `main.tsx:66–96`, `Link` | Existing `{href, children, className?}`. Preserve modifier/middle-click behavior, `aria-current` and `navigate`. |
| `src/client/ui/resource-state.tsx` | `ErrorBox`, `Loading`, `ResourceState` at 154–166, 204–262 | Preserve existing props, error text, alert/status roles, 404 recovery and protocol-upgrade detail links. `StatisticsState` stays with statistics pages until another caller justifies moving it. |
| `src/client/ui/identity.tsx` | `Badge`, `Avatar` at 264–275 | Existing `{children,color?}` and `{name,size?,index?}`. Retain the emblem/monogram/color-index behavior. These are already reused; no variant registry is required. |
| `src/client/use-load.ts` | 98–151 | Export current `useLoad(path, schema, interval?)` unchanged as an interim reader. Preserve visit objects and request sequences. Do not hide a wholesale Query migration inside this move. |
| `src/client/site-bootstrap.ts` | 62–64 | Export existing `SiteBootstrap` and `SiteBootstrapSchema`. This gives both owner and application composition a schema/type home without importing each other. |
| `src/client/agent-onboarding.tsx` | `AgentOnboarding`, 277–366 | `AgentOnboarding(): ReactNode`; URL-local choice, clipboard fallback and feedback remain internal. Reused by GetStarted and owner setup. |
| `src/client/owner-sign-in.tsx` | `SignIn`, 1540–1651 | `SignIn({data: SiteBootstrap, refresh: () => Promise<void>})`; preserve full callback path/query and local-login behavior. |
| `src/client/owner-dashboard.tsx` | `Dashboard`, `QueueDetail`, `OwnerDashboard`, 1653–2191 | Export `Dashboard({bootstrap, refresh, pairing?})`. Keep QueueDetail, pairing markup and account command coordination private initially. This is one coherent owner module rather than a form with dozens of forwarded props. |
| `src/client/use-secret-overlord-match.ts` | `useMatch`, 959–1037 | First export the existing hook as `useSecretOverlordMatch(id)`; preserve its decoder, cursor/reset merge, retry/backoff and heartbeat. |
| `src/client/secret-overlord-match.tsx` | `PolicyTrack`, `MatchResult`, `LiveMatch`, 1056–1537 | Export `SecretOverlordMatch({id})`; keep policy/result helpers private. Container owns clock and replay controls, like the existing Succession container owns composition. |
| `src/client/match-route.tsx` | Match union schema and `MatchRoute`, 1039–1053 | Export `MatchRoute({id, fullHistory})`. Keep protocol dispatch based on the response, not URL game choice. |

`main.tsx` then retains app/header/footer composition and the currently unrelated Home, leaderboard, public profiles and rules. This is an intentional bounded first extraction: it frees the owner and game-read/replay work from editing the application module. It does not require moving every page to a router framework or immediately creating an `app.tsx` containing the same large file.

**Existing Succession split is the precedent, not a generic multi-game abstraction.** Keep `succession-board.tsx`, `succession-controls.tsx`, `succession-display.ts`, `succession-rules.tsx`, `succession-match.tsx` and `succession-stream.ts` at their current locations. Secret Overlord's full in-memory observation/replay is materially different from Succession's paged authorized history. Do not invent a common `GameStore` to conceal that difference.

When a subsequent replay design issue needs the Secret Overlord visual seams, extract only these coherent pieces from its container:

```ts
// src/client/secret-overlord-board.tsx
// frame is ReturnType<typeof replayFrame>; final outcome stays in the container.
declare function SecretOverlordBoard(props: {
  frame: ReturnType<typeof replayFrame>;
}): ReactNode;

// src/client/secret-overlord-replay.tsx
// Controlled reading controls; never fetches or submits a game action.
declare function SecretOverlordReplay(props: {
  view: Observation;
  step: number | null;
  playing: boolean;
  onSeek: (step: number | null) => void;
  onPlayingChange: (playing: boolean) => void;
}): ReactNode;
```

Type `view` as `Observation`, `step` as `number | null`, `playing` as `boolean`, `onSeek` as `(step: number | null) => void`, and `onPlayingChange` as `(playing: boolean) => void`. Type `frame` as `ReturnType<typeof replayFrame>`; its seats already contain the selected historical state. This second move belongs with the first consumer of those interfaces, not an unused abstraction in TIM-13.

## TIM-10: transport and selected Query slice

### 1. Preserve the transport; add cancellation

Extend `src/client/api.ts` with a narrow optional request control:

```ts
export type ApiRequestOptions = { signal?: AbortSignal };

export declare function api<A, I>(
  path: string,
  schema: Schema.Codec<A, I>,
  body?: ApiRequestBody,
  options?: ApiRequestOptions,
): Promise<A>;
```

This is a proposed type shape, not a replacement implementation. Append options to the private request function, pass `signal` to `fetch`, and preserve the current method/body inference, same-origin credentials, protocol header and both success/error decoders. Existing three-argument POST callers keep working.

Important detail: both body-reading branches currently use `response.json().catch(() => null)`. An aborted body read must **not** become “unreadable response” or a synthetic HTTP error. Check/propagate cancellation before sending and immediately after body reading, including the non-2xx branch, before applying the existing fallback decoder. Keep all ordinary malformed-body behavior unchanged. Do not allow a general `RequestInit` to override the protocol/credentials policy.

Query functions pass `({signal}) => api(path, schema, undefined, {signal})`. Multi-page/parallel replay reads propagate the same cancellation lifecycle to every constituent request and stop starting pages after abort. They cancel sibling work on failure/reset. Keep generation/epoch validation even with abort support: server work and already-delivered messages may outlive cancellation.

### 2. Small replay read interface

Add `src/client/succession-replay-data.ts`. It owns endpoint construction, codecs, response correlation, bounded-page walking and typed Query option factories. It has no DOM, local playback state or dependency on a React container.

```ts
type MatchReadScope =
  | { kind: 'public'; credentialRevision: number }
  | { kind: 'agent'; agentId: string; generation: number; credentialRevision: number };

type ReplaySelection = {
  matchId: string;
  epoch: string;
  through: number;
};

type ReplaySlice = {
  frame: ReplayFrame2;
  events: readonly AuthorizedEvent2[];
};

// Each returns queryOptions(...) with an inferred, decoded result type.
// These are caller-facing shapes; implementations can infer tagged key types.
declare function replaySliceOptions(
  scope: MatchReadScope, selection: ReplaySelection,
): UseQueryOptions<ReplaySlice>;
declare function roundIndexOptions(
  scope: MatchReadScope, matchId: string, epoch: string,
): UseQueryOptions<RoundIndex2>;
declare function historyAnchorOptions(
  scope: MatchReadScope, matchId: string, epoch: string, eventKey: string,
): UseQueryOptions<HistoryAnchor2>;
```

`MatchReadScope` identifies the **actual read audience and local credential lifetime** (see keys/auth below). It contains no credentials. The factories capture no mutable global selected game or match. Their implementations continue using `ReplayFrame2Schema`, `HistoryPage2Schema`, `RoundIndex2Schema`, `HistoryAnchor2Schema` and the existing reset-response unions.

The replay-slice implementation preserves the current algorithm:

1. Validate the selected cursor against the accepted history head in the consuming hook.
2. Fetch frame at `through` and history in `(max(0, through - 32), through]` together.
3. Use a fresh `SuccessionHistory`, `observe`, `seek`, `historyPath` and `accept` for that selected window.
4. Limit every page to **32 events / 16384 bytes**. Continue byte-short pages from their **delivered cursor**, with the same epoch/through. At most 32 progressing pages can fill a 32-event window; reject incomplete/no-progress results.
5. Require match ID, epoch and frame `through` to match the request. Publish `{frame, events}` together only after both succeed. Never show a frame at N with events silently belonging to M.
6. Throw a typed internal `HistoryReset extends Error` on a valid reset alternative, carrying the **requested** match/epoch. Do not adopt an epoch from the history response; request current state through the existing hook. Retry is false for reset and decoder errors. No automatic reset loop.

Add `src/client/use-succession-replay.ts` to own the three Query resource kinds and reading controls currently at `succession-replay.tsx:30–201`:

```ts
declare function useSuccessionReplay(props: {
  view: Observation2; // accepted current, never a historical frame
  refresh: () => void;
  memory: React.MutableRefObject<FeedReadingMemory | null>;
}): {
  through: number;
  seek: (through: number) => void;
  playing: boolean;
  togglePlayback: () => void;
  displayed: ReplaySlice | null;
  rounds: RoundIndex2 | null;
  loading: boolean;
  paused: boolean; // network-paused read, distinct from playing === false
  error: Error | null;
  retry: () => void;
};
```

Import the existing `RoundIndex2` type from `src/shared/history.ts`. The `SuccessionReplay({view, refresh, memory})` JSX module keeps its existing external interface. Move HTTP loading/error/retry implementation out of that JSX file; keep the terminal summary in `SuccessionMatch` and the non-actionable historical board in replay.

**Preserve last-displayed behavior:** while a new seek loads or fails, the last successfully displayed slice may remain visible, labeled with its own `frame.through` and loading/error status. Keep only a local **displayed selection pointer** and a non-fetching (`enabled: false`) observer for its Query entry, not a second writable `useState(frame)`/`useState(events)` mirror. At most the requested and displayed window are retained. Release the previous displayed observer on successful seek. A match/audience/epoch change immediately clears that pointer; previous private data is never a placeholder in the new scope. Playback advances only when displayed/requested cursors agree.

`src/client/query-client.tsx` owns a stable browser `ClientQueryProvider` created once per mounted application, with explicit defaults. Tests create independent clients. This SPA needs no server-global singleton or persistence plugin. The parent coordinates its one provider insertion in `main.tsx`.

### 3. Exact key examples

Keys below name **decoded document contracts**, not components. The version string distinguishes a client response shape from the game's protocol/rules versions. Keep factories beside the resource modules; no generic query-key framework is needed.

```ts
// Current browser match reads are public: api.ts sends no Authorization,
// and the socket URL carries no controller ticket. Owner login is not control.
const publicRead = ['public', credentialRevision];

['match-read-v1', matchId, '2', publicRead, 'replay-slice', epoch, { through, window: 32 }];
['match-read-v1', matchId, '2', publicRead, 'rounds', epoch];
['match-read-v1', matchId, '2', publicRead, 'anchor', epoch, eventKey];

// Proposed raw-page key if TIM-23 uses Query for one page at a time:
['match-read-v1', matchId, '2', publicRead, 'history', epoch,
  { after, through, limit: 32, maxBytes: 16384 }];

// Future actual controller transport must use a different audience scope:
const controlledRead = ['agent', agentId, generation, credentialRevision];
// Never use an access token, socket ticket or private payload as a key.

// Later ordinary reads: examples, not additional TIM-10 migration scope.
['session-v1', sessionRevision, 'bootstrap', gameId];
['session-v1', sessionRevision, 'owner', ownerId, 'dashboard', gameId];
['session-v1', sessionRevision, 'owner', ownerId, 'pairing', pairingVisit];
['public-v1', 'agents', gameId];
['public-v1', 'agent', agentId, gameId];
['public-v1', 'owner-roster', handle, gameId];
```

Use a local opaque `pairingVisit` mapped one-to-one to the current code, changing whenever the code changes; don't retain the secret-bearing pairing URL as a diagnostic key. Default/explicit `secret-overlord` URLs map to the same resource game ID. Include `gameId` even if the default URL omits it. Match protocol is resolved from the validated observation; route query parameters never override it.

### 4. Query lifetime, visits and errors

Selected replay policy:

- Ordinary `useQuery`, **`retry: false`**, `throwOnError: false`, `networkMode: 'online'`, `refetchOnWindowFocus: false`, `refetchOnReconnect: true`.
- **`gcTime: 0`** for inactive replay slices, pages, anchors and round indexes in this first slice. Retain the requested/displayed windows only; don't turn every 700ms playback step into five minutes of cached frame/history documents.
- Replay slices, terminal round indexes and successful anchors for a fixed epoch/tuple use **`staleTime: Infinity`**, with explicit retirement/invalidation. Use `Infinity`, not `'static'`, because manual invalidation must remain available. No replay interval polling. The current server's complete round index and replay are terminal-only (`src/server/match.ts:697–755`); there is no live round-index query to invalidate on each packet.
- Gate replay/index queries on overall termination, a valid selection and accepted audience/epoch. Keep the existing non-Query MatchRoute and live hooks as initial/current readers for this slice, so Query is not a competing live snapshot writer.
- Manual retry refetches the current requested read (and any failed anchor/index needed for it), not every cached match. Failed HTTP reads do not clear the accepted live view.

**A–B–A cases to preserve:**

1. A request is still pending when the final A observer leaves: consumed signal cancels it. Returning to A starts a new read; late A1 cannot replace A2. An old manual retry has the same rule.
2. A successfully completed before leaving: Query can otherwise reuse it. `gcTime: 0` and no cross-match/epoch placeholder avoid introducing a long-lived revisit cache. Requested/displayed replay windows are explicitly scoped and bounded. If another observer still owns A, Query legitimately shares that resource; do not globally cancel another reader merely because one component changes selection.
3. For later statistics migration, **keep new-visit loading behavior** and current-pool error isolation. A completed cache entry can exist when another consumer is still mounted, even with zero GC. Give page-local statistical views a visit-specific key suffix (e.g. `['public-v1','agent',id,gameId,'visit',visitId]`) when preserving strict fresh-visit behavior is required; share one observer/result within that page. Keep the visit identity stable across a manual retry, new across A–B–A, and reset it on record identity change. Do not turn off these guards to gain cross-page cache reuse. Resource prefixes still support invalidation.
4. Pool choice does not remount the owner page, identity heading, rules title or setup form. `useRecordIdentity` remains local identity-retention behavior; it must not supply previous-pool statistics.

Initial failure renders existing ResourceState/ErrorBox recovery with `ApiError.status`, `code` and `details`. Initial no-data + `fetchStatus: 'paused'` renders an offline/waiting status, not an endlessly active spinner. A refetch failure retains same-scope successful data and displays the existing stale-update/error treatment. A 404 has the existing missing-record recovery; a protocol-upgrade error retains required-rules/CLI links. Cancellation is lifecycle cleanup, not a user-facing failure. Decoder failure is an error even when HTTP status is 200; do not infer success from status alone.

### 5. Realtime → validated state → Query

```text
HTTP refresh / action receipt (captured ticket) ─┐
WebSocket packet (decoder + connection fence) ──┼→ SuccessionCurrent.accept
                                              └→ accepted view in live hook
                                                   ├→ live board/controls
                                                   ├→ history.observe + bounded page delivery
                                                   └→ retire/invalidate scoped Query reads

Query replay slice → historical board + selected window (non-actionable)
```

Keep `SuccessionCurrent` framework-independent. The integration belongs in `use-succession-match.ts`, immediately after **successful acceptance**, with the previous accepted observation available for comparison:

- Same match/audience/epoch, increasing head: update history availability. Do not refetch immutable terminal replay/index tuples on live packets. Do not increment delivered cursor or append a socket “event” to history. An accepted terminal observation enables the replay/index readers under its accepted archive epoch.
- Accepted epoch transition: synchronously clear old displayed selection/reader state from render eligibility, then cancel and remove queries under the old match/audience/epoch. New query keys use the newly accepted epoch. Late old requests cannot become current data or surface a new-scope error. Keep at most the opaque reading anchor for translation through the existing anchor endpoint.
- A reset response triggers a bounded explicit current refresh; only that accepted current response can select a new epoch. If refresh fails or returns no new epoch, show retry recovery rather than repeatedly walking/resetting history.
- On disconnect keep last accepted view and the existing connection message. Reconnect remains 500ms exponential backoff capped at 10s, with the 20s ping heartbeat and connection generation checks. A valid decoded **and accepted** packet is the resync point; socket-open alone cannot clear a fault. An ignored stale packet must not announce fresh current state.
- Preserve protocol-1 cursor/reset behavior in the Secret Overlord hook. Its reconnect appends only validated, non-overlapping delivered events or replaces history on reset; verify overlap/duplicate behavior at the hook seam instead of assuming Query handles it. If improving duplicate suppression during TIM-10, use the protocol's authoritative event IDs/cursor, not a new server format or text-based deduplication.

Do not call `setQueryData` for live `Observation2` in this slice. The experiment shows why an unguarded HTTP refetch could otherwise overwrite an accepted socket update. Do not implement “realtime” as invalidating/refetching the entire history on every packet.

### 6. Decision mutation and subsequent owner mutations

Inside `use-succession-match.ts`, use one `useMutation` to replace the manual command `pending` lifecycle at 163–187. The mutation variable is the complete request plus captured local acceptance ticket/lifecycle identity:

```ts
type SubmittedDecision = {
  matchId: string;
  request: ActionRequest2; // gameId, actionId, phaseId, decisionId, action
  scope: MatchReadScope;
  ticket: number;
  lifecycle: number;
};
```

Generate `actionId` **once per user submission**, before calling mutate. Preserve the local pending guard and current `active`, `you`, `private`, `decision` prerequisites. Use **`retry: false`, `networkMode: 'always'`** for the command so it attempts/fails promptly rather than queueing an old decision for automatic offline replay. No persisted mutations. Aborting a client wait cannot undo server acceptance; do not label it a cancelled game action.

On success, acknowledge the returned action ID for the same live lifecycle and controlling scope even if the receipt snapshot loses its ticket race, then run `accept(result.observation, ticket)`. Accepted current changes use the integration above. Keep command errors separate from history failures and clear the pending state on failure. Late mutation callbacks after unmount, credential change or replacement controller may not update the current UI. Apply lifecycle/scope checks to failures as well as successes; ticket rejection of a snapshot alone cannot suppress an obsolete error message. The small hook interface remains `act(action)`, `pending`, `receipt`, `error`; callers do not learn Query mutation internals.

Owner mutations are a **later bounded conversion**, after the owner/session seam below. Proposed invalidation map, preserving existing event-driven behavior:

| Confirmed operation | Invalidate/refetch |
| --- | --- |
| Create competitor | All dashboard pool variants for this owner/session, that public owner roster and both affected public agent-list pools; select returned agent ID and clear draft only after creation succeeds |
| Retire competitor | Owner dashboards, this agent's public record in each pool, owner roster and agent-list pools |
| Revoke installation | Owner dashboards/installation state; accepted server queue/participation remains authoritative |
| Approve pairing | This pairing query and owner dashboards; retain approved receipt even if refreshing statistics fails |
| Link provider | Auth/provider-session refresh and owner dashboards after confirmed success/redirect; preserve callback behavior |
| Local login / sign-out | Credential transition procedure below, not broad invalidation alone |
| Create preview exhibition | Bootstrap variants for the chosen game, then navigate to the returned match ID; unrelated contenders choice must not select the game |

Use no automatic mutation retries or optimistic server-state edits. Await the targeted invalidations for pending UI where appropriate, but report “saved; refresh failed” separately from a rejected command. Retain the existing duplicate-command guard across account operations; separate mutation instances must not accidentally enable concurrent retirement/revocation while another account operation is pending.

## Auth isolation and later ordinary-read conversion

At this baseline, `api.ts` uses same-origin cookies; `worker.ts:89–113` includes the owner in bootstrap. `worker.ts:319–379` uses an **agent Authorization header** for entitled match/history HTTP reads, and `match.ts:828–869` uses an optional socket ticket for controller sockets. The current browser module sends neither. Thus an owner session and an agent-controller audience are distinct. Preserve existing entitlement-oriented schemas and browser tests even though the standard browser path is public.

For TIM-10, scope match reads using the actual accepted audience and a local credential revision; public is the normal path. An unexpected controller observation must not be cached under a public key. Clear scoped reads and remount the game hook only on an external credential/audience replacement or a different match. An accepted takeover generation or archive epoch change retires the affected Query scope **without recreating `SuccessionCurrent`**; its retired-epoch and generation fences must survive that transition. The ordinary public read lifetime can use revision zero until credentials actually vary; do not add a controller-auth implementation to this issue.

Before moving bootstrap/owner reads to Query, add `src/client/use-owner-session.ts` as the **one owner-session coordinator**, driven by the neutral bootstrap/auth result rather than a game-specific statistics query:

```ts
type OwnerSessionScope = {
  revision: number;        // local credential lifetime, never the cookie/token
  ownerId: string | null;  // null only after known anonymous response
  ready: boolean;         // unknown/transition is not anonymous
};
```

The module can wrap existing bootstrap refresh initially. Keep the server owner record in the decoded bootstrap; the scope above is a request-lifetime identity, not a duplicate editable owner profile. Its transition behavior is part of its interface:

1. While a credential-changing operation is pending, suspend/mask private reads and prevent new private commands.
2. After confirmed login/sign-out/account switch, increment revision **before** launching new reads; capture that revision in each request/callback. A failed sign-out displays the existing error and restores the previous confirmed session rather than pretending logout succeeded.
3. Cancel old session-prefixed queries, remove their query and mutation data, and clear old private render state/drafts. Merely invalidating them can retain the prior owner's data. Gate late mutation callbacks by their captured revision; clearing MutationCache does not unsend an operation.
4. Refresh neutral bootstrap without using old owner data as placeholder. Enable owner queries only when ready and owner ID is known. A cookie/session 401 masks private data immediately and asks this coordinator to recheck once; avoid one refresh loop per failed poll.
5. Observe confirmed owner changes from bootstrap polling and recheck on focus/reconnect for external-tab session changes. Use the same transition procedure. No persistent localStorage/IndexedDB Query cache in this batch.

Later read families and proposed poll ownership:

| Family | Poll owner and cadence | Notes |
| --- | --- | --- |
| Neutral/default bootstrap | App: 15s normally; 10s while Home uses the default live browser | Home default browser/archive derive from this one Query resource; default archive adds no timer. Keep Header dependent only on neutral bootstrap. |
| Succession bootstrap on Home | One Home observer: 10s when browser-selected, 30s otherwise for mixed archive | Share its result between browser/archive sections; don't create an additional timer in each section. Both archive responses contribute independently to partial-error UI. |
| Selected agent list | Home contenders or Leaderboard: 30s, one mounted poll owner | Derive display arrays during render, not an effect mirroring Query data. |
| Default owner dashboard | Owner container: 10s | Roster/queue/installation truth. Selected default statistics derive from it. |
| Non-default owner statistics | Statistics section: 10s while selected | Its error never removes roster/participation or resets forms. |
| Profile/owner public record | No interval, explicit load/retry | Preserve heading identity and fresh visit statistics. |
| Pairing details | No interval, explicit load/retry/approval refresh | Enabled only for a present code and ready owner session; expiry uses `ApiError.code`. |

For a behavior-preserving ordinary-read conversion, explicitly use `retry: false`, `refetchOnWindowFocus: false`, `refetchOnMount: true`, `staleTime: 0`, `gcTime: 0`, `refetchIntervalInBackground: true` (existing intervals run while hidden), and `networkMode: 'online'` with visible paused status. `refetchOnReconnect: true` provides a stale HTTP resync; browser timers remain subject to throttling. Any later decision to pause hidden polling is a separately verified UX change, not a library default adopted accidentally. Session focus recheck is narrower than refetching all public lists on focus.

This follow-on replaces the listed `useLoad` readers and refresh cascades **family by family**, after their specific A–B–A and auth tests pass. Delete `use-load.ts` only when its last migrated caller is gone. It is not necessary to implement all these families to complete TIM-10's selected replay/command slice.

## History contract for TIM-23

Expose/request ranges without conflating network pages, retained events and logical completeness:

```ts
type HistoryRange = {
  matchId: string;
  epoch: string;
  after: number;
  through: number; // frozen for this read
};

// Existing low-level seam remains sufficient for the first consumer:
historyPath(matchId, { epoch, after, through });
reader.seek(after, through);
reader.accept(decodedPage, requestedWalk);
```

- Keep **256 retained events per reader**, 32-event/16KiB request caps, delivered cursor and frozen through. Replay retains its own selected 32-event window, independent of the live reader.
- Retained data is not the archive. TIM-23 must automatically request an older range again when a reader revisits events evicted from memory. `seek` and the existing server range endpoints already permit this. Cache eviction must never make “start of available memory” look like “start of match.”
- `hasMore` and server-delivered cursor drive subsequent requests. Do not advance by 32 after a byte-short page, jump to stream head, use `events.length` as the global offset or treat an empty filtered UI as end of history.
- Order by authorized stream ID **within epoch**. Preserve `eventKey` for stable row/reading identity; do not mix live/archive numeric IDs. Reject overlap/gaps at the requested-page seam; deduplicate range display by epoch/ID, using eventKey for cross-epoch anchor translation.
- Do not accumulate all history in a Query `InfiniteData` cache while also keeping 256 events in the reader. A `maxPages` count alone does not describe the event budget because byte-short pages vary in size. The first Query raw-page adapter should use zero inactive retention; TIM-23 may add an explicit bounded range cache with eviction/revisit tests if needed.
- Chapter/navigation metadata, unloaded-range placeholders, viewport anchoring, prefetch distance and whether measured DOM costs justify virtualization belong to TIM-23/design. Query cancellation and page loading are reusable implementation support, not the continuous-list UX.

## TIM-11: styles, primitives and lockfile ownership

### CSS entry and tokens

TIM-13 preserves the six imports in `main.tsx:55–60`. TIM-11 introduces `src/client/client.css` and replaces those imports with that one manifest only at its cascade checkpoint. Suggested order:

```css
@layer theme, legacy, base, components, utilities;
@import 'tailwindcss/theme.css' layer(theme) prefix(tw);
@import './styles.css' layer(legacy);
@import './luminous.css' layer(legacy);
@import './sitewide.css' layer(legacy);
@import './motion.css' layer(legacy);
@import './succession.css' layer(legacy);
@import './local-game-controls.css' layer(legacy);
@import './ui/primitives.css' layer(components);
@import 'tailwindcss/utilities.css' layer(utilities) prefix(tw) source(none);

@source './ui';
@source './succession-replay.tsx';
/* Add each migrated consumer deliberately. No global Preflight import. */
```

This is the proposed cascade shape; TIM-11 must inspect the compiled output. Preserve the `luminous.css` external font import (hoist the font import to the manifest if bundling imports into a layer requires it). Keep old rules together in **one** legacy layer to preserve their relative source order/specificity; splitting the six into precedence-ordered layers changes how those existing selectors compete. No unlayered duplicate imports. Important-rule ordering reverses across layers, so retain and explicitly check the existing important reduced-motion/focus rules.

Use `src/client/ui/tokens.css` for approved namespaced semantic variables and Tailwind `@theme inline` mappings; import it through the manifest before primitive styling. Example mapping, with final values inherited from the Luminous theme/design:

```css
.replay-ui,
.replay-ui-portal {
  --replay-background: var(--bg);
  --replay-surface: var(--surface);
  --replay-foreground: #e8f1ed;
  --replay-muted-foreground: var(--muted);
  --replay-border: var(--line);
  --replay-ring: var(--green);
}

@theme inline {
  --color-replay-background: var(--replay-background);
  --color-replay-foreground: var(--replay-foreground);
  --color-replay-border: var(--replay-border);
  --color-replay-ring: var(--replay-ring);
}
```

Map the remaining chosen semantic roles similarly; use `tw:bg-replay-background` etc. in the prefixed Tailwind 4 syntax. Namespaced replay tokens avoid redefining legacy `--muted` as a background. Include approved display/body fonts, spacing, stepped shapes, border contrast and motion tokens. Reuse `--step`/decorative CSS where a utility would obscure the design. Keep focus rings on an unclipped outer interactive element; stepped clipping must not clip the focus indicator.

### Primitive interface

Start with source-owned modules under `src/client/ui/`, importing only the dependencies their code uses:

- `button.tsx`: native button props plus `variant: 'primary' | 'secondary' | 'quiet'`, `size: 'default' | 'small'`. Keep `disabled`, `type`, ref and accessible name native; use an explicit link for navigation rather than a button role on an anchor.
- `collapsible.tsx`: selected shadcn/Base UI Root/Trigger/Content composition for chapter disclosure when the approved design needs it. Keep open/closed state in the chapter owner, not in Query.
- `dialog.tsx`: selected Base UI-family composition, with title/description and initial/return focus. Add only if the approved replay interaction needs a dialog.
- `popover.tsx` / `tooltip.tsx`: add only for the actual selected interaction. Essential information must remain available to tap/keyboard users.
- `primitives.css`: scoped baseline styles required because Preflight is absent, including explicit border style, inherited font, sizing, focus and reduced-motion behavior.

Use current shadcn source as the starting point, with the **Base UI family** consistently. Keep its control semantics while mapping styles to the approved theme. Copying the few needed modules and normalizing imports is acceptable; the current repository needs no alias migration just to run the generator. Record each copied source/version/dependency in TIM-11. Do not import the template's global `body`, `*`, default palette or global animation stylesheet without auditing/scoping it. Portaled content needs the same `.replay-ui-portal` tokens, focus treatment and motion policy as the in-page root.

### Shared files

**Parent/integration coordinator owns `package.json` and `package-lock.json` for the first downstream batch.** TIM-10 requests `@tanstack/react-query` 5.102.8. TIM-11 requests `tailwindcss`/`@tailwindcss/vite` 4.3.3 plus only the selected primitive dependencies. The coordinator installs exact versions once and gives both branches the resulting baseline. TIM-11 alone owns `vite.config.ts`, the CSS manifest, tokens and primitive modules. The parent serializes the provider/CSS import changes to `main.tsx`. This avoids independent lockfile resolutions and competing theme edits.

## Slices, acceptance and handoff

### TIM-13 — mechanical extraction checkpoint

- Move the exact modules in the extraction table; record moved symbols/files in the handoff.
- Preserve `MatchRoute`/record keys based on pathname, not statistics query parameters; preserve native DOM structure/classes, scroll anchors, modifier links and form mounting.
- Run repository typecheck, lint and build. Run the existing `e2e/local-game-controls.spec.ts`, relevant owner/error cases in `e2e/sitewide.spec.ts`, and existing Secret Overlord/Succession route/replay tests after the moves. No new tests that only assert file locations or mirror extracted implementation.
- Handoff the owner and Secret Overlord modules to their consumers; keep TIM-10 and TIM-11 from independently moving them again.

### TIM-10 A — cancellable read and replay checkpoint

- Add the narrow signal option, Query provider, typed replay read module and replay hook. Remove the superseded anchor/round/window HTTP effects and mirrored request state from `succession-replay.tsx`.
- Pass the already decoded protocol-1 observation from MatchRoute to `SecretOverlordMatch({initial})` and `useSecretOverlordMatch(initial)`; seed cursor from `initial.cursor` and connect once. Explicit retry still obtains fresh HTTP current state. This removes `main.tsx:1012`'s duplicate initial read after extraction, without merging protocol-1 and protocol-2 state models.
- Verify abort before headers/during JSON read; malformed 2xx and non-JSON non-2xx still use existing errors. Verify delayed A–B–A, old manual retry, same-key concurrent observers, initial offline state, retained-data failure and manual retry.
- Verify frame/window correlation, byte-short pages, epoch reset during an in-flight read, delayed live/receipt snapshots, generation/forfeit regression and archive-anchor translation. Epoch reset cannot refetch indefinitely or resurrect an old display.
- Verify after many replay steps that inactive Query entries do not retain the whole archive; only bounded requested/displayed windows remain. Both seek-back and a range revisit after eviction make the relevant data reachable again.

### TIM-10 B — command and realtime lifecycle checkpoint

- Move only the existing Succession decision lifecycle to `useMutation`; preserve the hook's small caller interface and acceptance tickets. Add no owner mutation migration before the owner-session contract is implemented.
- Connect accepted epoch/head changes to exact read retirement/invalidation. Establish a resync point on accepted packets; preserve reconnect/heartbeat and lifecycle fences.
- Test double-submit, command rejection, receipt after newer current, command success + readback failure, offline command, unmount/auth change during a command and rejected stale packet after reconnect. A game command is never automatically replayed after reconnect.
- Run `tests/succession-ui-stream.test.ts` and existing transport/history coverage, plus `e2e/succession.spec.ts` (especially delayed archive/live, replaced controller, growing history and bounded replay cases). Keep `e2e/local-game-controls.spec.ts` and the malformed-response/session-expiry cases of `e2e/sitewide.spec.ts` as regression coverage for shared transport/root changes. Run required typecheck/lint/build.
- Record the exact migrated readers/mutation and deleted effects. Bootstrap, owner and public statistics conversion remains a separately refined follow-on using the policy in this note.

### TIM-11 — cascade, then control checkpoint

- First validate only dependency/plugin/manifest/layer changes against representative current routes. A prefixed utility fixture should win where intended; unaffected selectors, fonts and important motion/focus rules must retain their behavior.
- Then implement the approved replay primitives/tokens and one representative disclosure/control. Verify keyboard open/close/return-focus, portal tokens, narrow and desktop layouts, zoom/long identities and reduced-motion/hidden-document behavior.
- Run typecheck/lint/build and targeted existing sitewide, Succession and motion browser checks; compare screenshots at the actual tested viewport dimensions. A successful Tailwind build is not visual compatibility evidence.
- Handoff primitive exports and semantic token names for event-card/chapter/timeline consumers. Feature issues consume these modules; they do not edit the global theme in parallel.

### TIM-23 handoff acceptance

Its implementation must test a history longer than 256 events: reach the end, revisit an evicted early range, return to the current range, and preserve reading anchor through live growth and archive epoch expansion. Automatic loading must stay bounded and distinguish loading/failure/unloaded ranges from the real ends of the story. This acceptance is required even if an infinite-query or virtualizer is later used.

## Evidence status

This document is a design proposal, not a claim that the interfaces are implemented. TIM-8 inspected the merged source and current first-party library docs and ran the isolated Query Core experiment recorded in the research note. Production typecheck/build/browser suites and a CSS/Workers/AI runtime experiment were not run for this documentation task. Downstream verification above is required when those changes are made.
