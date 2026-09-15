# TIM-29 — shared current portraits

Branch `feat/tim-29-shared-portraits`, exclusive worktree `/tmp/opencode/agent-game-TIM-29`, based on `6b83e92`. Picture contracts and accepted TIM-28 corrections are in [TIM-28 evidence](TIM-28-agent-pictures.md). Styling/cascade ownership follows [TIM-11 foundations and corrections](TIM-11-foundations.md), including the `ee2220f` correction checkpoint.

## Independent lookup delivery

`src/client/agent-picture-data.ts` provides the decoded batch boundary:

- `PictureIdentity = { id: string; picture?: AgentPicture }` accepts original persistent competitor IDs and optional current profile fields.
- `AgentPictureMap = ReadonlyMap<string, AgentPicture>` is the parent-to-consumer interface.
- `readAgentPictures(ids, signal?)` deduplicates and sorts IDs; a ten-entrant roster makes **one** `GET /api/agent-pictures?agentId=…` request. Larger public lists are split into batches of at most 50. An empty roster performs no request.
- The existing decoded `api()` boundary preserves `AbortSignal`, canonical HTTP errors, and invalid-success handling. Batch results must contain each requested ID exactly once; missing, duplicate, or unrelated rows are rejected rather than correlated by response position or display name. A valid missing-picture record remains usable metadata.
- `agentPictureOptions(ids)` keys only the canonical roster IDs, shares in-flight reads, disables automatic retries/focus/reconnect refreshes, and retires inactive keys immediately (`gcTime: 0`). There are no picture-version, event-cursor, controller, harness, model, or credential keys. No polling is installed; explicit refresh and the bounded image-error recovery govern current revalidation while mounted.
- `mergeAgentPictures(agents, current?)` selects the newest revision for each requested competitor and fills omitted legacy fields with `missingAgentPicture`. A newer missing revision beats an older present picture. Metadata for unrelated IDs is excluded. This function accepts current profile metadata, **not immutable mutation receipts**.

`src/client/use-agent-pictures.ts` exports:

```tsx
// Once at the fixed-roster parent, using the original entrant's stable agentId:
const portraits = useAgentPictures(view.seats.map((seat) => ({ id: seat.agentId })));

// Profiles/leaderboards/owner rosters already carry current metadata; no initial extra GET:
const portraits = useAgentPictures(agents, { lookup: 'provided' });

// Pass to every seat, mention, result, or portrait at this parent:
portraits.pictures; // ReadonlyMap<string, AgentPicture>
portraits.revalidateUnavailable; // () => void, for the shared portrait's image-error callback
portraits.isFetching;
portraits.error;
portraits.refresh(); // Explicit result/error-bearing refetch; rejects on error
```

The default lookup mode is `current`; `provided` mode also tolerates old profiles with no picture field without fetching each row. Incoming newer profile fields supersede cached older metadata immediately. A failed image can request one additional **whole-roster** read per mounted roster identity. All consumers share that budget; repeated failures, including different broken versions returned by revalidation, cannot create a fetch loop. A changed roster gets its own budget and query key; retirement aborts the previous request. Explicit refresh is available for deliberate current revalidation and is independent of that automatic budget.

## Verification of the lookup delivery

```bash
npx vitest run tests/agent-picture-data.test.ts tests/client-api.test.ts tests/agent-picture-api.test.ts
npx playwright test --config .tim29/playwright.config.ts
npm run typecheck
npm run lint
npm run build
npm run format:check
git diff --check
```

- **32 scoped Vitest tests passed:** 14 new lookup tests, 10 existing ordinary client API tests, and 8 existing binary picture transport tests.
- The lookup tests use a native HTTP server on an OS-assigned loopback port; the fetch spy only resolves browser-relative paths. They verify one deduplicated ten-entrant read, response-order independence, the 50-ID boundary, URL encoding, no empty request, in-flight reuse, removal/current revision selection, legacy retired profile decoding, malformed/uncorrelated metadata, canonical 503 handling without retries, cancellation, and query retirement without caching late data.
- **5 browser hook tests passed:** production-bundled React, the actual `ClientQueryProvider`, and `useAgentPictures` execute with routed HTTP fixtures. They verify one map shared by three readouts across rename/takeover props; no initial profile lookup and immediate newer removal; one shared image-failure recovery budget; error-bearing explicit refresh; and roster replacement/unmount abort and cache removal.
- Typecheck, lint, production build, formatting, and diff checks pass. Logs are retained under `.tim29/`; reproducible scripts are indexed in [`.tim29/commands.md`](../../.tim29/commands.md).
- The browser probe is deliberately a hook lifecycle readout. It does not stand in for the shared portrait component or claim production consumer adoption, image decoding, enlargement accessibility, or mobile visual verification. Those checks accompany the consumer integration once the Dossier-owned component interface is handed over.

## Consumer integration handoff

The Dossier agent owns the shared `AgentPortrait`, enlargement/dialog behavior, portrait CSS, guide, and canonical Succession route. This independent delivery is ready for that component's metadata and image-error props. Its implementation/export interface is the remaining dependency for consumer adoption.

| Consumer                                         | Metadata and integration seam                                                                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Profile heading                                  | Reuse `agent.picture` through `lookup: 'provided'`; one profile-level hook. Parent serializes the `main.tsx` insertion.                                                                                                                                |
| Leaderboard and public owner roster              | One `provided` lookup at `LeaderTable`; pass the map/callback to every row. The current row is an anchor, so enlargement needs a sibling trigger rather than nested interactive elements. Parent serializes this extraction/insertion.                 |
| Private owner roster/control                     | Reuse refreshed profile fields and preserve the accepted mutation-confirmation → current GET → metadata-only retry flow. The owner control's receipt is never fed into current metadata.                                                               |
| Lobby selected table                             | Bootstrap summaries contain names but **no entrant IDs**. Resolve the selected match through its existing observation API and use its original seat IDs; do not guess identities from names or copy controller pictures. Parent serializes `main.tsx`. |
| Legacy Secret Overlord seats, results, chat/feed | One current lookup at the match parent from original `view.seats[].agentId`; pass one map to board, result, and feed. Historical names, roles, takeover facts, and result credit stay historical while the picture is current.                         |
| New Succession/Dossier                           | Dossier owner can consume the same hook/map with its original entrant IDs; no independent portrait implementation is required.                                                                                                                         |

Production consumer verification still needs the actual shared component: uploaded image reuse across surfaces, retired/renamed/taken-over entrants, old URL 404 and bad-PNG decode fallbacks, Enter/Space enlargement, Escape/close/focus return, long names, and 390/320 px overflow checks. Existing guide group/term counts and production exclusion remain with the Dossier/parent integration checks.
