# TIM-28 — optional stable-identity agent pictures

Implemented on `feat/tim-28-agent-pictures` from `d5d0630`. All verification is local; no inference, remote Cloudflare tests, deployment, or source-arena credential/data import was performed.

## Interfaces for TIM-29 and TIM-30

`src/shared/agent-picture.ts` exports `AgentPictureSchema`, `AgentPicturesSchema`, `AgentPicture`, `missingAgentPicture`, and the byte/dimension/batch limits. `AgentProfile.picture` and its Effect codec are optional for wire compatibility; this server always supplies the field on new profiles, profiles, owner rosters, dashboards, and both games' leaderboard lists. Old client/profile fixtures can omit it. Treat omission as `missingAgentPicture`.

```ts
type AgentPicture =
  | { state: 'missing'; revision: number }
  | {
      state: 'present';
      revision: number;
      version: string;
      url: string;
      contentType: 'image/png' | 'image/jpeg';
      width: number;
      height: number;
      bytes: number;
    };
```

The initial missing revision is `0`. Removal returns a **new missing revision**, not `0`. A picture is optional throughout pairing, admission, play, settlement, and history. An unavailable image response must also fall back gracefully in TIM-29; it does not invalidate the competitor.

### Public reads

| Request                                             | Response                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET /api/agents/:agentId/picture`                  | Current `AgentPicture`; `ETag: "<revision>"`; JSON `no-store`                                     |
| `GET /api/agent-pictures?agentId=<id>&agentId=<id>` | `[{ agentId, picture }]`; 1–50 supplied IDs, duplicates coalesced, unknown IDs explicitly missing |
| `GET /api/agents/:agentId/picture/:version`         | Current version's binary bytes                                                                    |
| `HEAD /api/agents/:agentId/picture/:version`        | Current version's binary response headers, empty body                                             |

IDs use the existing stable identifier alphabet (`[\w-]`, maximum 100 characters). Batch reads are one bounded D1 query and **zero R2 requests**. Profile/list metadata uses a D1 left join and **zero R2 requests**, including for missing pictures. There are no per-agent R2 HEAD probes.

### Owner and connected-agent writes

| Principal                                                   | Endpoint                             | Methods         |
| ----------------------------------------------------------- | ------------------------------------ | --------------- |
| Existing owner session cookie + same-origin website request | `/api/owner/agents/:agentId/picture` | `PUT`, `DELETE` |
| Existing paired bearer grant for exactly this agent         | `/api/agents/:agentId/picture`       | `PUT`, `DELETE` |

Both routes use the existing `ownerSession` / `agentSession` and ownership checks. Future TIM-27 preview privilege checks belong in those existing session paths; the image route has no preview bypass. Wrong owners/agents receive `404`; unauthenticated, revoked, expired, and retired bearer connections receive the existing `401` faults. Retired agents cannot upload (`409` for owners); their owners can remove an existing picture. Owner pairing permission text now includes picture management.

Every write supplies:

```http
If-Match: "0"
Idempotency-Key: <unique 8–128-character request ID>
```

- First read the metadata and use its quoted revision in `If-Match`.
- `PUT` sends **raw binary bytes**, with exactly `Content-Type: image/png` or `image/jpeg`; no multipart, JSON/base64 wrapper, filename, URL fetch, game/protocol negotiation, or new pairing exchange.
- `DELETE` sends no body. The zero-byte reader accepts genuinely empty proxy streams while rejecting any content.
- Successful writes and successful retries return `200`, the resulting `AgentPicture`, and its revision ETag.
- After a lost response, retry the **same endpoint/method, bytes, precondition, and idempotency key**. The immutable receipt is returned even if a later change has superseded it; it never republishes the old asset. Fetch current metadata after reconciling the receipt.
- A different operation reusing a key yields `409 picture-request-reused`. A stale precondition or authorization changing while an upload is in flight yields `412 picture-conflict`. Refresh and make a new deliberate change with a new key; do not silently overwrite the newer picture.
- Missing/malformed revision: `428 picture-precondition`; malformed key: `400 picture-request-id`; invalid raster: `400 invalid-picture`; excessive dimensions: `400 picture-dimensions`; excessive body: `413 body-too-large`; unsupported/mismatched type: `415 picture-content-type`. Fault envelopes use the existing `{ error: { code, message, status } }` contract.

TIM-30 can offer skip / owner-provided file / existing-tools-created file, then send the selected local bytes using the existing bearer token. This feature has no inference or generation dependency. Keep the existing stable `agentId`; changing harness/model or pairing another installation does not create an image identity.

### Owner control

`src/client/owner-agent-picture.tsx` exports `OwnerAgentPicture({ agent, refresh })`; the dashboard is its only consumer in this change. It uses the dedicated binary client in `src/client/agent-picture-api.ts`. The roster card's native expandable control has a labelled file input, loading/status/error announcements, upload/replace/remove, a retry retaining the original operation, and a labelled full-image link. Retired profiles expose removal. Existing styles are reused.

## Identity, history, caching, and preview provenance

**Policy: display the current picture of the stable original entrant, including in old/final matches.** Neither live nor historical match snapshots, role knowledge, controller facts, chat, action history, or settlement are copied into image records. Both games' public `seats[].agentId` comes from the original `seat.entrant.agentId`. TIM-29 should key portrait lookups by that value, never the house/controller identity after takeover. The real Worker test completes a forfeited match and demonstrates the original picture surviving takeover; replacing the picture afterward leaves the entire finished observation equal while the stable-ID image read changes.

Binary URLs contain a fresh UUID version and are relative to the current arena origin. Delivery checks current D1 metadata before reading R2 and only serves that current version. Replaced/removed URLs return `404`, even if their bytes have not yet been collected. Responses use the verified raster MIME, `nosniff`, inline disposition, `Cross-Origin-Resource-Policy: same-origin`, version ETag, and `Cache-Control: public, max-age=0, must-revalidate`. Conditional requests return `304` only for an existing current object. This deliberately favors removal/replacement visibility over long immutable browser caching; a previously downloaded copy cannot be recalled.

Alchemy `Cloudflare.R2.Bucket('AgentPictures', { publicAccess: false })` is a stage-scoped private resource bound as **`AGENT_PICTURES`**, alongside each stage's existing isolated D1 database. Local Wrangler uses `agent-game-dev-pictures`. There is no production bucket name, public `r2.dev` delivery, source credential, or source URL fallback embedded in metadata.

### Extension boundary for TIM-27

Migration **`0003_agent_pictures.sql` is reserved by TIM-28**. TIM-27's new migrations must start at `0004` after integrating this work.

- Reusing exactly the stable source owner/agent IDs is compatible with the new tables. An insert-only identity import that only populates `owners`/`agents` naturally starts with `{ state: 'missing', revision: 0 }` locally and cannot overwrite local picture choices.
- Do not copy `picture_json`, version URLs, asset intents, or idempotency receipts as mutable identity metadata. They refer to this arena's local R2 and revision history.
- A future explicitly approved image-byte import must obtain source bytes through a trusted, bounded source channel, validate them through the same image validator, allocate a **new local version** and R2 object, and publish through the same optimistic local revision fence. A locally removed image is a tombstone and must not be recreated by an insert-only import. Source picture version/provenance, if needed, belongs in separate import metadata; it is not controller identity.
- That cross-arena import is not implemented here. A two-arena local test seeds identical stable IDs insert-only in an independent D1/R2 store: the source URL and credentials fail there, its local picture is missing, and source metadata remains intact.

## Storage, transaction, and collection decisions

`migrations/0003_agent_pictures.sql` adds three tables:

- `agent_pictures`: one current metadata/tombstone row per stable agent, monotonic revision, optional version, Effect-decoded `picture_json`.
- `agent_picture_operations`: immutable receipt keyed by `(agent_id, request_id)`, SHA-256 fingerprint of expected revision/method/content digest, unique server attempt ID, result JSON.
- `agent_picture_assets`: one intent per R2 version, stable agent ID, `pending | live | garbage`, expiry, collection timestamp.

R2 keys are `agent-pictures/<stable-agentId>/<fresh-server-UUID>`. The upload validates and bounds bytes before creating an intent or touching the current picture. Intent creation precedes R2 PUT. A single D1 batch atomically inserts a receipt only when the expected revision, ownership, retirement/grant validity, and live upload intent still match; publishes only that unique attempt; and marks its asset live. Concurrent requests serialize at this transaction. An existing receipt cannot re-enter the publication path. D1 failures after R2 PUT leave the previous picture intact and a tracked orphan; ambiguous write failures never trigger speculative R2 deletion.

The hourly Worker scheduled handler (`17 * * * *`, also wired in Alchemy) runs `collectAgentPictures`. It atomically claims at most 50 unreferenced assets as garbage before deleting bytes. Pending intents expire after 15 minutes; publication rejects expired or garbage intents. Live-but-replaced objects are collectible immediately. A concurrent publisher cannot adopt a claimed object; a current winner is excluded by the same D1 claim. Deletion failure retains the tombstone for retry. Garbage tombstones are retained and revisited no more than daily, so even an extremely late R2 PUT after a successful delete is eventually removed and cannot be published. Request receipts and tombstones are intentionally retained; future bounded archival/pruning needs its own retention policy. High churn can exceed the bounded collector's throughput and accumulate a backlog without affecting current-picture correctness.

The collection tests assert actual R2 orphan count reduction, winner-byte survival, durable retry behavior, and recovery after an injected D1 transaction failure.

## Validation scope

- Maximum **2 MiB** of file bytes, **1–2048 pixels** per dimension. The streaming reader enforces its actual byte count and cancels overflow regardless of absent or lying `Content-Length`; it never calls unbounded `arrayBuffer()` on an upload.
- PNG: signature, IHDR parameters/dimensions, bounded chunk structure, native `node:zlib` CRC32 checks, palette/data/end structure, at most 1024 chunks, rejection of animation and unknown critical chunks.
- JPEG: SOI/EOI, bounded segment lengths, baseline/progressive 8-bit one/three-component dimensions, scan structure and nonempty entropy data. CMYK and other JPEG encodings are outside this initial contract.
- Type headers must agree with inspected bytes; extensions are never used. SVG, HTML, URL JSON, animated PNG, unsupported types and obvious truncation/corruption are rejected before replacement.
- This is container validation, **not a full pixel decoder/transcoder**. JPEG entropy correctness and PNG decompression/pixel correctness are not exhaustively decoded server-side. Browsers decode the bounded raster; TIM-29 must also render a fallback on load/decode failure. No sanitizer or image-generation claim is made. Native CRC32 support and both accepted raster types were exercised in the installed local Worker runtime; real Chromium decoded the uploaded PNG and JPEG.

## Verification

Retained scripts/configs/fixtures/captures are in `.tim28/`; local D1/R2 state and full command logs remain in ignored `.tim28/runs/` and `.tim28/*.log`. They are exclusive to this worktree. The small JPEG fixture is an 8×8 format conversion of the existing TIM-6 desktop portrait screenshot, not generated by an inference service.

| Check                                                                                                                                                                | Result                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npx vitest run tests/agent-pictures.test.ts`                                                                                                                        | 8 real local Worker/D1/R2 integration tests passed                                                         |
| `npx vitest run tests/platform-repository.test.ts tests/rating-storage.test.ts tests/client-api.test.ts tests/worker-errors.test.ts tests/succession-codecs.test.ts` | 33 existing regression tests passed                                                                        |
| `npx playwright test --config .tim28/playwright.config.ts`                                                                                                           | Real owner upload browser flow passed, including a deliberately lost committed response and same-key retry |
| `npx playwright test --config .tim28/owner-regressions.config.ts`                                                                                                    | 2 existing owner/profile and pairing/revocation flows passed                                               |
| `npm run typecheck`                                                                                                                                                  | All three TypeScript projects passed                                                                       |
| `npm run lint`, `npm run format:check`, `npm run build`, `git diff --check`                                                                                          | Passed; full outputs retained in `.tim28` logs                                                             |

Browser evidence: [desktop upload](../../../.tim28/captures/owner-upload-desktop.png), [narrow upload](../../../.tim28/captures/owner-upload-narrow.png), [retired removal](../../../.tim28/captures/owner-removed.png). The browser flow checks keyboard expansion, labelled input, excessive-file feedback, invalid replacement preserving the visible image, `aria-busy`, error/status announcements, actual image decoding, enlargement link, replacement, and retired-owner removal. Only isolated port `8828` / inspector `9228` and ephemeral Worker ports were used.

The storage regression run printed Miniflare/workerd Cap'n Proto diagnostic messages during existing concurrent settlement tests; all 33 assertions passed. No paid/remote verification was attempted. Production R2 account enablement and deployment credentials were not inspected or changed; provisioning requires the existing deploy identity to have R2 bucket creation access. Local R2 required no account feature activation.

## Retrieved platform/source references

Checked against installed Alchemy **2.0.0-beta.76**, Wrangler **4.129.1**, and locked workers-types **5.20260907.1**; no dependency/version or npm release-age policy changes:

- [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), retrieved 2026-09-14.
- [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/): binding `put/get/delete`, strong consistency, metadata, stream responses.
- [D1 Database API](https://developers.cloudflare.com/d1/worker-api/d1-database/): transactional `batch`; ordinary binding reads use the primary unless Sessions replication is explicitly requested.
- [Workers node:zlib](https://developers.cloudflare.com/workers/runtime-apis/nodejs/zlib/): native compression/checksum API compatibility.
- Installed `node_modules/alchemy/src/Cloudflare/R2/Bucket.ts`: resource constructor, stage-derived names, default/private public access; `Cloudflare/Workers/Worker.ts`: resource env binding and `crons` property.
- Installed `node_modules/wrangler/config-schema.json`, `@cloudflare/workers-types/index.d.ts`; regenerated `worker-configuration.d.ts` with `npx wrangler types --strict-vars=false`.
