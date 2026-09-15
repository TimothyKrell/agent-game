# TIM-27 lifecycle follow-up

Implementation: `3c7bf990a7ecfb8686d33a199a9ccdc37de8d949`.

Passing checks: **121/121 tests across 11 files** (57.81 seconds), followed by
**2/2 targeted runner tests** (8.17 seconds) after adding final resource-binding
assertions. Full typecheck, repository lint with `--deny-warnings`, production
build, scoped formatting and `git diff --check` pass. The regression reports ran
against the implementation worktree immediately before its commit; their
synthetic artifact commit is the then-HEAD `12e5c00`. The separately recorded
final artifact is built with the committed `3c7bf99` identity.

## Concrete remaining blocker

The existing source/target guards compare incarnation and commit tuples. They
cannot distinguish generations when a predecessor recurs. The retained
`generation-gap.test.ts` holds a real D1 REST-shaped request for C after observing
A, commits newer B and A transactions, then releases C. **Both source and target
accept the stale C write.** This is a separate failing probe, not a passing
regression or hosted acceptance claim.

Reproduce (expected exit 1 until fixed):

```sh
NO_COLOR=1 node node_modules/vitest/vitest.mjs run --config .tim27-lifecycle/generation-gap.vitest.ts --reporter=verbose --reporter=json --outputFile.json=.tim27-lifecycle/generation-gap.json
```

Required parent-owned extension: reserve a migration and approve a narrow
control-plane generation helper. Each origin's durable generation must advance
and be checked in the same native D1 batch as configure/register/publication/
retirement. Source fencing must survive retirement/recreation. Retry must reuse
its generation; an older delayed request must fail even if its predecessor's
commit recurs. The helper can preserve the existing key validation/encryption
and runtime interface. The lifecycle lane has made no additional production SQL
or migration changes. Hosted activation stays default-off pending this fix.

## Completed follow-up work

- Reproduced a transient GitHub recheck retiring an otherwise open registered
  incarnation (`retry-red.txt`). `PreviewEligibilityChanged` now identifies only
  observed eligibility changes. Unavailable/malformed reads and failed
  verification preserve pending identity. Actual GitHub transport coverage also
  checks an in-progress newer attempt before any attempt-specific job inventory.
- Extracted the shared `applyPreview` Plan/Apply/lifecycle boundary and
  `arenaResources` graph. The fixed command, protected credentials and trusted
  production Cloudflare provider selection remain in `preview-alchemy.ts` and
  `alchemy.run.ts`.
- Full-graph local tests cover failed prebuilt upload after key persistence,
  serialized cold retry, actual source artifact GET readback, source outage
  before any destructive provider call, deletion of a nonempty local R2 bucket
  with artifact/release/identity activation absent, exact-run finalization, and
  fresh-incarnation same-proof recreation.
- The test harness substitutes cloud resource CRUD and remote Alchemy state;
  it exercises the real locked Alchemy engine/prebuilt reader, unchanged Worker
  bundles, native Miniflare D1/R2 and actual accepted lifecycle helpers. It does
  not attest hosted Cloudflare resource deletion or the protected source release.

## Evidence

Original `checks.json`, `tests.json`, `integration.json`, artifact inventory and
scripted-game reports remain historical evidence for `1a7d537`. Follow-up reports
and implementation commit are recorded separately in `followup-checks.json`.
The live integration test now emits its fresh receipt to ignored
`runs/integration.json` for explicit capture instead of overwriting the original.

Full regression command:

```sh
NO_COLOR=1 node node_modules/vitest/vitest.mjs run tests/preview-runner.test.ts tests/preview-lifecycle-state.test.ts tests/preview-d1.test.ts tests/preview-workflow.test.ts tests/preview-artifacts.test.ts tests/preview-publication.test.ts tests/preview-content.test.ts tests/preview-artifact.test.ts tests/preview-github.test.ts tests/deployment-ready.test.ts tests/cli-install.test.ts --maxWorkers=1 --reporter=verbose --reporter=json --outputFile.json=.tim27-lifecycle/followup-tests.json
```

Final committed artifact: **28 payloads / 4,354,556 bytes**, manifest SHA-256
`b40de2b6192606aebefc12aaad6ed5add56963bd2551a726b3cb296ccb957927`.
Its branch archive remains **18,026 bytes**, SHA-256
`c03c9aa85e12ae05d0072e8eaba6c2bbf60caa07167fafaabb64b033d774660e`;
only the commit-qualified public path changes. `record-followup.mjs` validates
the retained counts/commits and records report, text-log and artifact hashes.

No production runtime, broker, CLI, package, lockfile, credential or hosted
configuration was changed by this follow-up. No deployment or inference occurred.
