# TIM-27 — parent integration checkpoints

## Accepted identity slice

The identity architecture/probes (`2066abd`), contract correction (`a104f60`), implementation (`7f7e447`) and focused correction (`4c2a97f`) are integrated through **546bb8b**. The parent reconciled migration0004 with accepted picture migration0003, preserved `AGENT_PICTURES`, and regenerated Worker types with `--env-file /dev/null --strict-vars=false` to avoid incorporating unrelated local development-secret declarations.

Independent parent checks:

- **14 initial two-origin Worker/D1/Better Auth identity cases passed**, including Chromium. Parent copies of the original run outputs are `/tmp/opencode/TIM-27-lead-identity/`; original committed screenshots/results were restored unchanged.
- **21 image/repository/Worker regression cases passed** after the initial merge.
- After correction, **29 cases passed**: 16 identity cases plus 13 repository/Worker regressions. Outputs use `/tmp/opencode/TIM-27-lead-correction/` and `/tmp/opencode/TIM-27-lead-correction-tests.json`.
- Typecheck, lint, build, scoped formatting and whitespace checks passed on the combined integration branch.

Original reviewers confirmed **Standards 0 / Spec 0 outstanding** after the collision-safe import and exact-agent introspection correction. The original four architecture findings are implemented or explicitly gated at this slice boundary. Accepted identity functions remain documented in `TIM-27-identity-bridge.md`; correction provenance and immutable evidence in `TIM-27-identity-correction.md`.

Live target admission remains `503 preview-allocation-pending` until the broker/recovery slice is complete. The parent assigned the shared source-ledger broker to a new worktree from the accepted checkpoint, and the reusable CLI selector to a separate worktree containing accepted TIM-30 onboarding and prepared CLI0.3.0. The source identity worktree is quiescent for later archival.

## Trusted deployment review

The separate trusted deployment implementation (`f5a2f16`, `b276c8f`) has **Standards 0**, with two Spec P2 corrections assigned before integration:

1. Derive the tested build commit from immutable run-bound GitHub provenance, rather than the moving `refs/pull/N/merge`. An unchanged PR head can have a new synthetic merge after unrelated base-branch changes, while its successful run/rerun still refers to the original commit.
2. Default automatic activation to off until credential cutover. Use a distinct protected-environment deployment-secret name so the existing repository-scoped token cannot silently satisfy the new controller. Preserve an explicit trusted cleanup route for retained stages.

The independent reviewer reran 27 verifier tests and preserved the changing-base reproduction in `/tmp/opencode/TIM27-trusted-deploy-review-aiBfyc3L/`. Initial recorded evidence includes 59 tests, both scripted games, actual raw prebuilt Worker/DO/migration/R2 checks and locked Alchemy provenance. Those passes do not close the two newly exercised lifecycle cases.

## Artifact coordination seam

Parent commit **dc60060** adds source-published immutable artifact identities, migration0006 and read-only discovery. It passed **16 local D1/registry/repository cases** and static/build checks; independent Standards and Spec reviews each found zero new issues. The reviewer also reproduced a pre-existing close→fresh-incarnation trigger failure. Parent additive migration0007 in **54fc037** fixes that root cause while preserving0004. The reviewer confirmed closure after parent **17 registry/repository cases and 16 actual two-origin identity cases** passed.

The exact consumer/controller interface is in `TIM-27-artifact-registry.md`. Broker migration0005 is reserved separately. Publication requires the independently verified built commit and trusted source executable descriptor; no target-supplied executable becomes source-trusted.

This document records local integration, not hosted deployment, real-model gameplay or operating-budget reconciliation. Those remain coordinated acceptance work after the source/target, broker, CLI and trusted controller paths are combined and reviewed.

## Accepted trusted delivery and active lifecycle adapter

The corrections and content-publication mapping through **acf47b6** are integrated at **635894b**. Parent independently passed **89 tests**, typecheck, lint, build and whitespace checks. Both original reviewers confirmed **Standards 0 / Spec 0 outstanding**, closing the moving-merge provenance and automatic-activation findings above.

The corrected verifier binds the historical merge/base/head to the exact successful attempt's GitHub-recorded identity step and trusted workflow/producer blobs. Default-off activation and a distinct protected-environment token are enforced before the fixed Alchemy subprocess. Artifact-independent cleanup checks the live closed same-repository PR. Branch content has a bounded regular-text inventory, while executable authority comes from an independently pinned source release. These local contracts do not imply hosted activation.

The implementation owner has moved to `/tmp/opencode/agent-game-preview-lifecycle` from635894b to connect the trusted D1 resource/environment adapter, retained keys/incarnations, source registration/publication/readback, and source-first closure. The source broker continues separately; neither lane receives another allowance.

The completed trusted-deploy source is archived at `/home/timothykrell/Code/agent-games-archive/TIM-27-deploy-2026-09-15/`, preserving **7,322 source/evidence entries and 1,299 parent/reviewer entries**. Every member hash, unchanged source inventory, bundle and independent source recovery was verified.

- `worktree-evidence.tar.gz`: 298,985,294 bytes; SHA-256 `f70c90d449b043e40522629767864423e0b5168667f8d5c03229bd4f17176ff0`.
- `lead-review-evidence.tar.gz`: SHA-256 `859450a24c6b231a54a7cd2d6b72e09e93d808f5a28a3f4b49b8d0f1555d6c50`.
- `repository.bundle`: SHA-256 `e5bb891bcaa51846a0117d5cbf412625d3e3dbbc896dff298d1b4c311b6f80af`.

The completed worktree/local branch were retired. Git removed the worktree registration but could not delete read-only quarantined snapshots. All6,336 remaining files were reverified against the archive before making only those snapshot directories removable and deleting the remnants; `metadata/retirement.json` records this final disposition.

## Reusable CLI integration checkpoint

Sources **854eeae / b42248e** are locally integrated at **ce1d622**. Parent independently passed **113 tests serially**: 21 installed-preview cases and 92 existing CLI/picture/supervisor cases. Application and dedicated fixture types/lint, build, package-content and whitespace checks pass. Logs: `/tmp/opencode/TIM-27-lead-cli-tests.log` and `/tmp/opencode/TIM-27-lead-cli-package.txt`.

The source registry had been cherry-picked into the CLI branch; parent resolved add/add conflicts by retaining the accepted0007 retirement regression and its review evidence. No CLI-specific source change was discarded. The prepared0.3.0 archive is now52,969 bytes; existing0.1.1/0.2.0 release bytes remain immutable. Independent CLI Standards and Spec review is underway. Complete-game tests use scripted fixture allocations, not hosted or paid inference.

### CLI review corrections and full-suite baseline

Independent review of `7614bdb...b42248e` identified two new Spec P2s: dropped public wakeups during an authenticated HTTP read, and canceled participation pins taking precedence over a later game's selected artifacts. It also reproduced a pre-existing native-supervisor P2: fractional monotonic timeouts passed to `execFile` can fail before harness startup. Standards review found one P2: non-JSON401/403 responses lose HTTP status before the supervisor's authority-loss handling. All four are assigned to the CLI owner, with exact native/HTTP/Worker reproductions retained in `/tmp/opencode/TIM27-cli-spec-review/`.

The parent subsequently ran the **complete unit/Worker inventory at64876e6**: **711 tests across81 suites passed**, with no failures or pending tests. This establishes the combined baseline and does not close the newly reproduced cases. Results: `/tmp/opencode/TIM-integrated-unit-results.json`, `/tmp/opencode/TIM-integrated-unit.log`.

That run overwrote the CLI fixture's tracked scripted-results file. Parent preserved the fresh result separately at `/tmp/opencode/TIM-integrated-cli-scripted-results.json`, then restored the original committed artifact exactly. The CLI owner is adding a unique per-run evidence directory so filtered and failed runs cannot overwrite the original evidence. The earlier unidentified protocol-header rejection remains preserved and is not attributed to the separately proven timeout defect.

### CLI correction integration

**b79bb46 / f932a0e** are integrated at **aa88233**. Parent independently passed **138 cases serially:27 preview and111 CLI/supervisor cases**. Build, all application/fixture typechecks and lint, scoped formatting, packaged file assertions and whitespace checks pass. Fresh output is isolated under `/tmp/opencode/TIM-27-lead-cli-corrections/`; original committed evidence remains intact. The prepared0.3.0 package is now53,775 bytes, including the shared HTTP response boundary.

The corrected transport drains coalesced public wakes within the original wait deadline. Exact authoritative cancellation retires only the matching pending participation pin; its history/accounting remain. Native subprocess timeouts are finite bounded integers without extending the absolute deadline. The dependency-free HTTP decoder preserves status before attempting to interpret failure bodies. Standards review independently closes the HTTP-authority finding and reports no adjacent findings. Final Spec replay is pending.

Final CLI review now reports **Standards 0 / Spec 0 outstanding**. The reviewer replayed both-protocol wake/401 cases at54–75ms versus baseline801–808ms, exact Worker/D1 cancellation/reselection, native fractional/deadline cases and19 direct edge checks. Independent22 runtime and11 selected installed-package cases pass, with all17 original evidence hashes verified. Evidence: `/tmp/opencode/TIM27-cli-correction-review/f932a0e-4dj1p25q/review-evidence/REVIEW.md`. This accepts the local CLI implementation; the historical missing-header rejection remains recorded and unattributed, and hosted playable acceptance remains separate.

The accepted CLI is archived at `/home/timothykrell/Code/agent-games-archive/TIM-27-cli-2026-09-15/`: **1,510 source/evidence and8,716 parent/reviewer entries**. All member hashes, unchanged source, Git bundle and independent source recovery verified.

- Source snapshot:101,136,546 bytes; SHA-256 `57af8bbf5a3490492728b67920bee76c4caf9bbf871ea3e69382f317d33bbd21`.
- Parent/reviewer archive:SHA-256 `f4e43fca9a143edd6e942ef16855e07e97cf0f9314dc46f297432b8cff3eb2ae`.
- Git bundle:SHA-256 `fa0ae10d9aadf9af3a011a11c0ec011878064c8a4d698f5d7f95c24e070b1b50`.

The completed CLI worktree/branch were retired after a final clean audit. Its implementation owner moved to `/tmp/opencode/agent-game-playable-integration`, based on1c43b1b, for test-only integration of installed CLI/native harnesses with actual broker admission, provider transport and shared accounting. The lifecycle and broker production owners remain separate.

## Broker review checkpoint

Source **a953a3c** delivers source-executed inference and allocation recovery through the existing coordinator ledger, migration0005 and D1-only enablement, with no new target bindings. Standards review reports0 findings; Spec review reproduced twoP2s affecting production waiters/alarms and oneP3 live fill-time mismatch. Corrections are assigned before broker integration acceptance.

The source recorded93 tests, including16 native broker,56 ledger/regression,18 identity/Worker, two scripted-game and the full TIM-26 gate. That gate retains392 required calls and$1.2804700 accounted. The independent reviewer reran16+56 and preserved actual signed-HTTP/SQLite/production-scheduler probes under `/tmp/opencode/TIM27-broker-spec-review/`. The trusted lifecycle adapter continues against the handed-over D1-only interfaces; hosted activation remains gated.

Initial broker integration **1c43b1b** preserves the source artifact GET alongside broker-aware discovery, exact checkpoint/history code and additive migrations0005/0006/0007. Parent passed **88 native/identity/Worker/queue/repository/summary/cleanup cases**, then **11 ledger/registry cases**, and **27 installed CLI preview cases** against the combined server. The first command named a nonexistent `preview-ledger.test.ts`; parent explicitly ran the actual five-case `preview-broker-ledger.test.ts` in the subsequent11-case command. Typecheck/lint/build and whitespace checks pass. These establish integration compatibility and do not close the three assigned broker findings.

### Broker correction accepted

**6ec2fc8 /7987815**, integrated at **a1d9db7**, close all three broker findings: **Standards0 /Spec0**. The ledger enforces signed origin/incarnation ownership atomically before touching shared waiters or allocations. All coordinator alarm writes preserve the earliest deadline transactionally, and queue status/readiness/scheduling share the profile-aware fill time.

Parent **77 focused cases plus the full TIM-26 gate pass**; the full summary is byte-identical to the accepted baseline, SHA-256 `0146971cf0b7b759903887a069564f2147798b69c15e85d367d5b9f61badec47`. The reviewer independently passed66 head cases, reproduced four baseline failures and verified292 correction hashes plus223 original files and24 accepted artifacts. Production waiters and the$1.49 reservation survive unauthorized closure; automatic alarm postponement is0ms and live fill time is30 seconds.

Recovery: `/home/timothykrell/Code/agent-games-archive/TIM-27-broker-2026-09-15/`, preserving1,526 source/evidence and10,170 parent/reviewer entries. All member hashes, unchanged source, bundle and independent source recovery verified. Snapshot SHA-256 `d69d5b3847d1b94bcb2431765dc5f43aee45c9a535e1d0beffa0aede4a95b17d`; parent/reviewer archive `19274462e406fa861be2f5e52df7e6ad241a6739a98c4bd590c21a2dfca0a47b`; bundle `77d6ddf426b4b3d258ebdb65f0f37c1927870094ed3549ca1cd64b9575067f82`.

The completed broker worktree and merged local branch were retired after a final clean audit and removal of only their disposable dependency symlink. Source and all review/runtime evidence remain recoverable from the archive.

Trusted lifecycle work at **e49507f** has121 passing local cases and an independently retained source/target A→B→A generation failure. Parent reserved additive **0008_preview_generation.sql** and approved the narrow control-plane generation helper to fence delayed configure/register/publication/retirement batches. That lane remains active and activation default-off. The installed-CLI/broker integration and established browser migration have separate verification owners.

### Actual API and restart regression

The unchanged API inventory also passes **six tests** against a clean1c43b1b checkout and real local Worker/D1/DO processes. It covers full externally controlled completion, retry receipts, reconnect/private isolation, actual CLI pairing/queue/revocation, same-owner matchmaking and a real Worker restart during a required decision without downtime forfeiture.

The primary fixture used6441 and recovery8811; an existing8791 listener was left untouched. A fresh explicit environment/empty HOME and local scripted provider avoided production credentials and inference. Results and provenance: `/tmp/opencode/TIM-integrated-api/`. Both owned processes stopped after testing.

Recovery archive: `/home/timothykrell/Code/agent-games-archive/TIM-integrated-api-2026-09-15/`, with2,316 source/evidence and3,062 parent/runtime entries, all hashes and independent recovery verified. Snapshot SHA-256 `cf845f9f84d3a651922205c2a894fb17fb7d58fb43bbc9a37038c175921c13d8`; runtime archive `1115899ca4875e075c16f45edfe8dbecfda6d0648a67ea949764ee7f6cbe30b8`; bundle `7a2deb3771ae7da14875e70cef5b7ccf21f67b23384c2b09bb470130a2554143`.

## Combined unprivileged artifact verification

The parent ran the actual artifact producer against a clean detached **aa88233** checkout, with a fresh explicit environment and empty HOME. The checkout contains the production Dossier, complete portrait/summary adoption and corrected CLI. No account or deployment credential was supplied. GitHub identity fields were synthetic local fixture data, not a claimed successful hosted workflow.

The locked Wrangler4.129.1 `deploy --dry-run --outdir --no-autoconfig` path compiled the real Worker; the producer validated its static module inventory, production assets, migrations and content-addressed branch archive. Parent independently re-read and verified every declared payload size/hash: **27 payloads /4,531,688 bytes**. Manifest SHA-256: `f07ddb592f6a3b66a70432acdf54734a7ee939c2121ee015e09c95afa3a5b85a`.

Evidence: `/tmp/opencode/TIM-integrated-prebuilt/verification.json`, retained manifest/payloads/build logs, and `/tmp/opencode/verify-integrated-prebuilt.py`. Current command semantics were checked against [Wrangler Workers commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/#deploy), retrieved2026-09-15. The standalone `/commands/deploy/` URL returned404; the current Workers command reference explicitly documents dry-run compilation without deployment.

The disposable checkout and emitted bytes are preserved in `/home/timothykrell/Code/agent-games-archive/TIM-integrated-prebuilt-2026-09-15/`:2,055 source/evidence and2,863 output entries, with all hashes and independent bundle recovery verified. Snapshot SHA-256 `a1b55af5a38ae5db7f594208a1012b4fc467f63cf74d3524c68bf866cae93c3a`; output archive `3d57d9c1736ed644c74b4cd18753e2f9233a0c2bdb855b6625de24cad24a818d`; bundle `f92918cae92fabe96fdff8d3a26214c2e2d30bbc2c6412b595cc647b27e23857`.

The detached prebuilt checkout was retired after a final clean audit and removal of its disposable dependency link.

## Identity/source-registry recovery archive

The completed original identity worktree is archived at `/home/timothykrell/Code/agent-games-archive/TIM-27-identity-2026-09-15/`: **692 source/evidence entries and 1,511 parent/reviewer entries**, all member hashes verified. The bundle preserves both the original identity branch through4c2a97f and integration through54fc037, including parent artifact metadata and retirement corrections. Unchanged-source inventory, bundle verification and independent source recovery passed.

- `worktree-evidence.tar.gz`: 37,357,485 bytes; SHA-256 `794a661916d21ff5cfe075bc4b390014fbffd029da161e9b8720aeb13f37a852`.
- `lead-review-evidence.tar.gz`: 100,884,706 bytes; SHA-256 `460bdebbc997cf2282eaf0281e95d8df92d35035ae3153e68415e2a0aa5358ff`.
- `repository.bundle`: SHA-256 `a67b3db7896c7cf86782d5845198bb6b6c823c8d28727388b4d0781eb7b6b3d6`.

The active broker, CLI and trusted-deployment worktrees are separate. The completed identity worktree and merged local branch were retired after the final unchanged-source audit. This does not mark the overall TIM-27 issue complete.
