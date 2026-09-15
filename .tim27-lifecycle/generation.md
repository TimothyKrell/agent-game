# TIM-27 — durable operations and classified finalization

This follow-up implements the parent-approved generation scope and fixes the
completed-delivery finalizer P2 reported against `e49507f`. The implementation and
report commits, exact counts, report hashes and committed artifact provenance are
recorded in `generation-checks.json`. All lifecycle experiments here are local,
with synthetic GitHub/Cloudflare transport and actual Alchemy/native D1/Workers.

Implementation: **`dd998d5a9e529990db18ef48f200da29bf30ed33`**.

- **164/164** regression tests, 13 files, **171.36 seconds**; all original
  **121 unique passing test identities** are present and passing.
- **27/27** committed runner/lifecycle checks, two files, **80.27 seconds**.
  This supplement verifies the final one-line target-retire payload/revision
  alignment after the full pre-commit suite.
- Both complete scripted Worker games: **2/2**, **144.21 seconds**.
- Full application/infra/plugin typecheck, repository lint with `--deny-warnings`,
  production build, scoped Prettier and diff check passed.
- Committed artifact: **29 files / 4,356,376 bytes**; manifest SHA-256
  `e4ee281323bd3c6ee7b5a681f06b1aefb8ee9dc4fb8e6378c8bfe13ac7fd3f88`.
  The unchanged 18,026-byte branch archive is
  `c03c9aa85e12ae05d0072e8eaba6c2bbf60caa07167fafaabb64b033d774660e`.

The full suite's synthetic build identity is the then-HEAD `e49507f`; the committed
supplement, captured integration receipt and separately built artifact identify
`dd998d5`. The original red probe files and their old reports are byte-identical
to `e49507f`, verified by the evidence recorder.

## Durable operation fence

- Additive reserved migration `0008_preview_generation.sql` retains per-origin
  counters and immutable operation receipts independently of registry lifetime.
  Migrations 0003–0007, broker runtime and ledger remain parent-owned and unchanged.
- `src/server/preview-generation.ts` validates typed intents, canonical semantic
  payload hashes, safe counters and stable opaque operation IDs. Ciphertext
  randomness does not define operation identity. The encrypted trusted state
  reserves the exact ID, expected/assigned counter and payload identity before I/O.
- Configure/register/publish/retire/broker business writes and generation/receipt
  writes share one native bounded D1 batch. A failure anywhere rolls it all back.
  All actual lifecycle requests pass the existing 16-statement/128 KiB validator.
- An exact current applied retry is read-only. A superseded applied receipt is
  stale, even at an identical tuple. Same ID/different semantics conflicts.
  Unapplied stale fences never rebase during normal or cold retries.
- Target key/broker configuration precedes source activation. Source retirement
  precedes target retirement and all destructive provider work. Cleanup checks the
  full latest owner and exact generations again after destroy planning.
- The manual, independently verified **closed-PR** recovery path can reserve a
  distinct operation when an owned delayed delivery superseded an **unapplied**
  retirement reservation. Applied operations and unrelated generations cannot be
  superseded. Encrypted state retains abandoned exact fences in bounded history;
  valid current fences are reused unchanged.
- Source-broker operations use fixed separate encrypted control state
  `agent-game-preview-control/source-broker`; they do not replace production
  resource output. The parent serializes that explicit operator seam.

The accepted identity crypto/SQL and broker helper have **zero new diff** in this
extension. The narrow production artifact helper diff adds semantic atomic
`previewArtifactGuard` plus `{atomicGuard:true}` to its existing batch. Actual
lifecycle publication always enables it. No public write route or generation
mutation route is added; missing generation migration fails closed with 503.

## Completed-delivery finalizer

`PREVIEW_DELIVERY_COMPLETED=true` used to authorize retirement immediately, without
any GitHub read. An actual successful deployment followed by GitHub 503 or comment
HTTP 503 reproduced that defect. `finalizer-red.json` records both true→false
expectation failures against the old finalizer. Earlier diagnostic attempts are
also retained: the GitHub case reproduced while the comment case exposed first a
Node extensionless-import failure and then a top-level-await import cycle. The
Node-safe settings/target extraction fixes both publication-path blockers.

The workflow now schedules finalization on failure but provides no completion
authority flag. Valid observed smoke failures, valid conflicting source tuples,
or independently observed eligibility changes can produce an exact-owner marker.
It is bound to repository/PR, tested run/attempt, head/commit/incarnation, and this
controller run/attempt. Otherwise the finalizer freshly verifies GitHub and only
observed closure/head/run changes authorize retirement. Transport failures and
missing/malformed readbacks preserve the current identity even after completion.

`tests/preview-finalizer.test.ts` runs actual Node publication, smoke and finalizer
authority processes against local transport, then uses the same real Alchemy
runner/native D1 lifecycle as production. It checks GitHub 503, comment 503,
source 503, malformed JSON/schema, smoke 503, cold retry with unchanged key,
encrypted runtime row and generations, source-first confirmed invalidation,
wrong-run/current-owner rejection, stale marker rejection and workflow wiring.

## Evidence and reproduction

The original `generation-gap.test.ts` and `generation-gap.vitest.ts` are untouched.
Their unique pre-fix rerun is `generation-before-red.json` (two expected failures).
They intentionally still call the old unfenced primitive, so they remain red;
`tests/preview-generation.test.ts` retains the separate green source/target ABA
cases and receipt/rollback/race/close-recreate cases. The baseline inclusion check
matches all original 121 unique passing assertions by file and full test name.

```sh
npm run build
npm run typecheck
npm run lint -- --deny-warnings
NO_COLOR=1 node node_modules/vitest/vitest.mjs run tests/preview-runner.test.ts tests/preview-lifecycle-state.test.ts tests/preview-d1.test.ts tests/preview-workflow.test.ts tests/preview-artifacts.test.ts tests/preview-publication.test.ts tests/preview-content.test.ts tests/preview-artifact.test.ts tests/preview-github.test.ts tests/deployment-ready.test.ts tests/cli-install.test.ts tests/preview-generation.test.ts tests/preview-finalizer.test.ts --maxWorkers=1 --reporter=verbose --reporter=json --outputFile.json=.tim27-lifecycle/generation-tests-new.json
NO_COLOR=1 node node_modules/vitest/vitest.mjs run tests/preview-worker.test.ts --maxWorkers=1 --reporter=verbose --reporter=json --outputFile.json=.tim27-lifecycle/generation-smoke-tests-new.json
```

Use unique output names to preserve recorded evidence. All tests use OS-assigned
ports. `record-generation.mjs` verifies baseline inclusion, frozen probe hashes,
the committed artifact and all retained report/log hashes. Generated runtime
directories are ignored; secrets are never written into proof or evidence files.

## Hosted boundary and handoff

The parent separately verified the real D1 REST request envelope, numeric/null/
Unicode bindings, ordered metadata and transactional rollback in one disposable
database. This lane read its `assessment.json` and hashes its closed-file manifest
under `/tmp/opencode/TIM-27-hosted-d1-contract/`. That parent experiment preserved
its initial two incorrect assertion assumptions and confirmed DB removal by
404/code 7404; it is separate from these local tests and from source activation.
No parameter coercion or metadata relaxation was introduced.

Parent independently reviews/integrates the complete range from `635894b`, deploys
the required source capabilities and generation migration, supplies a genuinely
released hosted source pin and owns protected environments/broker operating
configuration. Local 0.3.0 packaging is not hosted attestation. Deployment,
identity and broker activation remain distinct and default-off. No hosted call,
deployment, inference, credential change, push, package/lock change or nested agent
was used by this lifecycle lane.
