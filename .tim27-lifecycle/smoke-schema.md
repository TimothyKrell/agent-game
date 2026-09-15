# TIM-27 — typed smoke invalidation correction

This is a separate correction to `87dda3896f37eafd9ed78273ff517b3b081aa4fc` for
the residual smoke-health P2. Original generation/finalizer reports and probe
files remain unchanged. Implementation commit, final counts and evidence hashes
are recorded in `smoke-schema-checks.json`.

Implementation: **`f03678759895946012a049eedd8f3202a591a3ad`**.
The expanded suite passed **170/170 tests across 14 files in 513.35 seconds**,
including all prior 164 and original 121 unique passing assertions. Both scripted
games completed through the actual Node smoke, including 3,136 Succession archive
events and both acts over the native socket. Typecheck, warning-free repository
lint, production build, scoped formatting and diff checks passed. The final
post-commit targeted supplement passed **4/4 selected health/socket controls in
68.33 seconds**. The committed 29-file / 4,356,376-byte artifact has manifest
SHA-256 `70446626a9d03604d1cab917c0c3fd040665bafaaec74dbb39cdc6f1787b7d70`.
Full hashes and provenance are recorded separately in the checks file.

## Reproduction

`smoke-schema-red.json` retains the failing real-path health `{}` preservation
test. The actual Node smoke first passed the normal target readiness wait, then
received HTTP 200 `{}` only on its protocol-bearing health request. The old global
`AssertionError` catch wrote an exact-owner `smoke-invalid` marker; the actual
controller authority and Alchemy/native-D1 runner retired the healthy incarnation.
`smoke-schema-red-observation.json` captures `retired:false → true`, zero finalizer
GitHub reads, and identical healthy actual target responses before and after.
This independently reproduces the parent's reported P2 against `87dda38`.

## Classification policy and audit

`scripts/preview-smoke-observation.ts` now owns a named `PreviewSmokeInvalid`
classification. `observeSmoke` decodes the supplied observation schema **before**
running a synchronous semantic check. Only assertions inside that decoded-data
callback acquire the named classification. The smoke entrypoint records retirement
evidence only for that class; it no longer catches all assertions as authority.

| Boundary                                   | Validation before semantic checks                                                                                                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protocol-bearing health                    | Required boolean `ok` and string `protocolVersion`; well-typed `ok:false` or a different protocol is a confirmed negative. Missing or ill-typed fields are unknown.                                             |
| Bootstrap                                  | Required mode, login/house booleans and string-array auth providers. A valid negative mode remains authoritative.                                                                                               |
| Exhibition assignment                      | Required constrained match ID before constructing a match or socket URL. Invalid assignments produce no marker.                                                                                                 |
| Socket packets                             | Decode the envelope and game-specific observation, including spectator identity/private-data shapes, before type/protocol/privacy/size checks. Malformed packets and socket transport errors preserve identity. |
| Match polls and terminal data              | Decode the consumed observation fields and nested structures. Terminal role/reveal and individual-result fields are decoded before use.                                                                         |
| History, round indexes, replay and anchors | Decode required scalar/array/nested fields before cursor, cardinality, replay-act and byte-bound assertions.                                                                                                    |
| Setup and transport                        | URL/setup errors, readiness-wait failures, unexpected HTTP statuses, 5xx/429, timeouts and decoding failures remain unavailable. They cannot create destructive evidence.                                       |

HTTP reads use bounded response bytes and fatal UTF-8 decoding before JSON/schema
decoding. This prevents replacement characters from turning invalid UTF-8 into a
seemingly valid protocol mismatch. Extra decoded fields are retained so current,
history, replay and event byte bounds and forbidden-field checks retain their
original meaning. These are Node-safe smoke projections of consumed fields; no
server/runtime module or privileged controller branch is imported or changed.

The existing exact-owner/controller-attempt marker binding, fresh GitHub fallback,
source-first retirement and generation fencing are unchanged. Unknown data fails
smoke/readiness without producing a successful smoke report or revoking the
existing identity. A valid negative still authorizes only its retained owner.

## Local verification

`tests/preview-smoke.test.ts` uses the real Node smoke and controller authority,
real Alchemy graph and native D1/Workers. Its local HTTP relay substitutes selected
readbacks. The WebSocket relay forwards actual target Worker/DO frames through an
OS-assigned local listener; no hosted socket or inference provider is contacted.

Coverage includes the exact health `{}` red/green case, wrong-type `ok`/protocol,
missing fields, invalid JSON, malformed UTF-8 embedded in otherwise parseable JSON,
structured health 503, malformed bootstrap/assignment/match/socket data, invalid
local URL configuration, and well-typed negative health controls. Unknown cases
assert no marker, fresh GitHub reads, preserved identity/source publication and
exact current generations; serialized cold retries retain the same incarnation,
key and operation plan. Valid negative controls assert source-before-target writes.

The successful real Node smoke completes both scripted games with actual HTTP and
WebSocket observations, both Succession acts, bounded archive paging and replay.
Its retained public receipt is `smoke-schema-games.json`. This exercises the new
schema projections on real game data without an additional redundant game suite.
The raw receipt's legacy `sourceCommit` field is the fixture's synthetic all-ones
PR head; the expanded suite's actual artifact/build revision is the then-HEAD
`87dda38`. The separately produced committed artifact names `f036787`. None of
these synthetic local identifiers attest a hosted source release.

Expanded regression command (use a new output filename when reproducing):

```sh
NO_COLOR=1 node node_modules/vitest/vitest.mjs run tests/preview-runner.test.ts tests/preview-lifecycle-state.test.ts tests/preview-d1.test.ts tests/preview-workflow.test.ts tests/preview-artifacts.test.ts tests/preview-publication.test.ts tests/preview-content.test.ts tests/preview-artifact.test.ts tests/preview-github.test.ts tests/deployment-ready.test.ts tests/cli-install.test.ts tests/preview-generation.test.ts tests/preview-finalizer.test.ts tests/preview-smoke.test.ts --maxWorkers=1 --reporter=verbose --reporter=json --outputFile.json=.tim27-lifecycle/smoke-schema-expanded-new.json
```

All original 164 passing assertions, including the original 121 baseline, are
matched by file and full test name in the expanded report. The recorder checks
that all prior generation/finalizer reports, original ABA probes and generation/
retirement implementation files remain byte-identical to `87dda38`.

## Handoff

Only the smoke classification helper/entrypoint and local controller/smoke fixtures
change implementation. No migration, generation/retirement interface, broker,
ledger, package/lockfile, CLI body, credential or hosted operating state changes.
Parent integrates this correction after its in-progress `87dda38` merge checkpoint.
Deployment/identity/broker activation stays default-off; these local receipts are
not hosted source-release or playable-activation attestation.
