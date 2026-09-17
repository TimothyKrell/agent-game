# Coding Finale production release

Authorized 2026-09-16: integrate local live-experience/recovery/discussion work, merge and deploy; delete past production games and reset leaderboard scores/records to zero, preserving identity and agent pictures.

## Delivery order and acceptance

- [x] Audit current branch, release workflow, production storage and existing failing checks.
- [x] Discussion: retain bounded unanswered directed-message context, encourage explicit recipient metadata, use 45-second Coding Finale discussion windows, preserve required-action clocks and strategic silence.
- [x] Reliability: diagnose the two last-match takeovers, settle terminal pending receipts explicitly, allow bounded graceful model shutdown and retain final usage.
- [x] Catalog: Coding Finale is the only public selectable/default game. Disable standalone Secret Overlord production admission. Explicit development/preview requests retain the experimental engines and existing registered preview contracts.
- [x] Challenges: add 30 distinct versioned families alongside routing, with published examples, explicit contracts, larger Tier 2 bounds, deterministic private-seeded suites, reference oracles, boundary checks and selected exhaustive cross-checks. Generalize practice/judging/archive presentation; preserve existing routing snapshots. Deterministic preview-provider fixtures retain routing.
- [ ] Release checks: lint, formatting, all TypeScript projects, core/API tests, relevant extended tests, browser/mobile regressions, real sandbox submissions and bounded live dialogue/full-match evaluation.
- [ ] Release new immutable CLI version (do not overwrite 0.4.0 archive bytes).
- [ ] Production cutover: stop admissions; account for active matches; export rollback data; delete match histories/artifacts and reset ratings/records while preserving owners, profiles, credentials, pictures; prevent late settlement from restoring deleted data.
- [ ] Review, commit, push, merge to main, observe deployment, verify live public catalog, clean history/zero leaderboards, challenge delivery, and spectator access.

## Evidence

Record actual commands/results and blockers here. A successful build is not a deployment, and a deployment is not a verified reset.

Initial state: `feat/coding-live-experience`, extensive prior task changes uncommitted; production previously reported at `146ba87`, CLI 0.4.0. Main CI deploys from pushes to `main`. Infrastructure is managed by Alchemy; match state/history is in Durable Objects and identity/summary/rating data in D1.

## Verification so far

- Core inventory: **879 passed, 3 intentionally skipped**, zero failures (`/tmp/opencode/coding-release-core-final.json`).
- API platform journeys: five passed; recovery initially contacted a leftover process from a timed-out local run. After terminating those identified test processes, the separate real Worker restart test passed (`coding-release-api-recovery.json`).
- Real production-path HTTP/DO/Sandbox integration: **2 passed**, including both acts, authenticated practice/submission, tier gates, reclaim and archive evidence (`coding-release-integration-results-2.json`).
- Thirty-family catalog: **33 tests passed**, covering every published example, boundary cases, deterministic suites, integer bounds and exhaustive subset cross-checks.
- Reset verification: actual Durable Object history/source deletion is idempotent, retired archive reads return 410, and SQLite verifies identity preservation, zeroed statistics and late-insert fencing. Production mutation has not been performed yet.
- All three TypeScript projects pass; repository lint passes with warnings denied.
- Browser feed, puzzle/reports, Act I archive, mobile onboarding and retained internal Succession reader pass. Catalog navigation fixtures are being updated to the new public-only catalog.
- Bounded Haiku dialogue (`/tmp/opencode/haiku-dialogue-release`): nine addressed messages and three explicit reply links; $0.2130311 reported. This fixed-phase trial demonstrates linked exchanges, not live-window performance or reliable mechanical reasoning; participants still made unsupported claims about Safeguards.

## Last-match reliability findings

In `match_37cb57e8-449e-4a54-87b3-f113c630e729`, Vector received an executive investigation decision at 22:45:10 UTC but repeatedly selected wait until takeover at 22:46:10. Compact observations now explicitly mark required action and explain that waiting does not submit a choice. Cipher's 88-second tool gap crossed a context-compaction boundary and voting deadline before takeover at 22:56:38; it then reclaimed. Longer discussion windows do not extend required voting deadlines or guarantee immunity to compaction stalls.

Terminal winners now supersede remaining pending receipts instead of leaving them apparently judging. The experimental monitor waits up to 90 seconds for terminal model reports before stopping remaining processes. Complete accounting and the effect of these changes on a new full real-model game still require that run.

Reconciled the previous full game by taking exactly one cost source per invocation: **$10.9482416**, combining completed reports with estimates for eight invocations missing final reports. Completed-report subtotal is $2.7573849; the separate all-stream estimate is $10.1526597. These totals overlap and must not be added. Reconciliation is still not a verified final bill: missing final output/compaction usage cannot be recovered from the captured stream. The report now makes this limitation and the per-invocation source explicit.

## Production cutover procedure

After successful deployment/migration, set `arena_control.admissions_paused=1` using the production D1 binding. Confirm no live matches remain, export D1 into private local storage, and execute `scripts/reset-production-games.sql`. The SQL records tombstones before deleting indexes and resets every rating pool and original profile statistics to zero. Verify identity/picture/grant counts against the export.

Visit retired match URLs to drive bounded cleanup immediately; cron also handles batches. Cleanup removes coordinator joins/allocations, match histories/source/evidence and house-seat jobs/notes, and destroys finalist sandboxes. Tombstones and local storage guards fence late writes. Confirm every tombstone is marked purged, public histories are empty and ratings/records are zero before clearing the admission pause. Preserve CLI 0.4.0 bytes and publish 0.5.0.

The reset also records a creation-time cutoff in `arena_control.retired_before`. D1 rejects late indexing of any match created at or before that cutoff, including unindexed objects. Cleanup registers pre-cutoff coordinator allocations as tombstones before processing them.

## Review corrections

The two review passes found a terminal-state decoder mismatch, concurrent discussion redelivery, successful-looking terminal reclaim receipts, and a missing live-history retry path. These are corrected with regression checks: finished states round-trip with current-generation superseded receipts, concurrent CLI history consumers claim each event once, terminal reclaim rejects new handoffs while retaining valid retries, and the live feed exposes an activity retry during transient outages. The browser outage/retry case passes. Extended compatibility checks also exposed preview `connect` overwriting the selected historical game; preview selection is now preserved.

## Completed full-table comparison

Match `match_a3695598-b99d-4cde-be1a-9fa401e804c8` completed in **26.19 minutes**, with **zero takeovers**, no forfeits and no budget stops. Cooperative agents qualified by five Safeguards; Vector (seat 4) won with Tier 2 submission 6. All six submissions were judged: five passed and Orbit's Tier 1 attempt hit the time limit. The public archive contains 334 events and 61 chat messages, including 15 addressed messages and six explicit reply links.

All ten Haiku harnesses exited successfully with final reports. Total reported cost, including readiness, is **$12.2294096**; no invocation relies on a stream-only estimate. Peak measured context was 67,365 tokens. This improves on the preceding run's two takeovers and eight missing final reports, but is a single comparison rather than a reliability rate. The live backend was started before review corrections and intentionally stayed fixed during paid play; review regressions were verified separately. This preview-provider match used routing, not a randomly selected new family.

Artifacts: `/tmp/opencode/claude-haiku-release-table/report.json` and `public-evidence.json`. Phone replay: `http://100.97.89.80:5193/matches/match_a3695598-b99d-4cde-be1a-9fa401e804c8` (Tailscale).
