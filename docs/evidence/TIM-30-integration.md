# TIM-30 — parent integration and CLI release preparation

**Accepted after correction `e4db4eb`, integrated at `83c73c1`: Standards 0 / Spec 0 outstanding.** The initial findings below are preserved as historical evidence.

## Integrated source and checks

Sources `8063129` and `e524898` were combined with the accepted TIM-28 image API/corrections and the first TIM-27 identity bridge. The ordinary connection, picture and existing game paths were independently exercised against that combined source:

- **18 picture/onboarding cases passed**, including installed CLI commands and real local Worker/D1/R2 uploads.
- **68 existing CLI/supervisor cases passed serially**, preserving both games, both harness setup paths, installed legacy compatibility, recovery, takeover and read-before-speech behavior.
- **Two production Worker boundary cases passed** with the new served archive version.
- All three TypeScript projects, repository lint, production build, scoped formatting and diff checks passed.

Parent command logs:

- `/tmp/opencode/TIM-30-lead-picture-tests.log`
- `/tmp/opencode/TIM-30-lead-regressions.log`
- `/tmp/opencode/TIM-30-lead-version-boundary.log`

## CLI 0.3.0 preparation

The parent updated only the application version fields in `package.json` and `package-lock.json` to **0.3.0**. Every dependency entry remains identical. `src/shared/onboarding.ts` selects the served archive from that version; the corresponding Worker boundary assertion was updated.

Before building the new version, the actual deployed **0.2.0** archive was downloaded from the production arena and retained in `cli/releases/agent-game-cli-0.2.0.tgz`. It is **37,739 bytes**, SHA-256 `47bf567f9609a47c2b5267a11a697a2181b614b022591ec9d13351733cc0056f`. All 13 regular package entries and the manifest were inspected without executing them. The archive contains no dependencies or installation scripts. The initial Python HTTP client received 403; an ordinary browser User-Agent request succeeded.

The clean build retained both **0.1.1 and 0.2.0 byte-for-byte** in `public/downloads` and `dist/client/downloads`, while producing the new 0.3.0 archive with `cli/picture.mjs`. No picture fixtures or tests are included. Original download metadata is retained at `/tmp/opencode/TIM-30-retained-production-cli.json` with response headers at `/tmp/opencode/TIM-30-production-cli.headers`.

Version 0.3.0 is an integration release under preparation. This does not claim a production deployment or completed preview-selector support. TIM-27's immutable per-arena/commit artifact pins will distinguish branch artifacts; the previously released filenames stay immutable.

## Review corrections pending

Independent review of `7233eb6...e524898` found:

- **Spec P2:** a saved pending operation can be resent without repairing a missing durable pending pointer after the journal/pointer write gap. Correct recovery must re-establish the pointer before network I/O and retain the unresolved-operation fence.
- **Spec P2:** `connect` catches a failed authoritative queue recheck as an optional choice-storage failure and incorrectly reports ready. Queue authority rejection must remain on the normal connection error path.
- **Standards P3:** the picture journal duplicates the existing durable JSON write algorithm. A shared dependency-free writer can preserve the supervisor's revision ownership and picture-specific directory preparation.

These are assigned as a focused correction. The passing baseline checks above do not close the newly reproduced cases. Original source/evidence is preserved. Hosted conversational adherence, real external image-tool behavior, trusted preview selection and automatic source-choice lineage remain the coordinated TIM-27/TIM-24 acceptance work.

## Correction acceptance

`e4db4eb` closes all three findings. The saved-pending branch repairs its pointer durably under the operation lock before file/network I/O; conflicting unresolved pointers remain fenced. Confirmed/rejected journals are not resurrected. Authoritative queue recheck failures propagate through the ordinary CLI error path, while optional picture metadata and choice-storage failures remain nonblocking. `cli/durable-json.mjs` owns the shared durable write algorithm; the supervisor ledger still owns its revision increment.

Parent independently passed **92 tests serially** on the combined **0.3.0** release: 24 picture/onboarding cases and 68 existing CLI/supervisor cases. The six new cases cover actual installed-CLI queue revocation and journal/pointer crash recovery. Typecheck, lint, build, scoped formatting, package-content checks and staged whitespace checks passed. Logs: `/tmp/opencode/TIM-30-lead-correction-regressions.log` and `/tmp/opencode/TIM-30-lead-correction-package.txt`.

Both original reviewers confirmed closure: Standards `ses_f5d4dec81ffeXEzjoeuzxeeQ9Y`; Spec `ses_f5d4d9d7dffeX4Oq1DsirTXYK4`. No outstanding findings remain in this slice.

## Recovery archive

`/home/timothykrell/Code/agent-games-archive/TIM-30-2026-09-15/` contains **1,280 source/evidence entries and eight parent entries**, with every archived member verified against its SHA-256 inventory. The source was unchanged across snapshotting; bundle verification and independent clone/source recovery passed.

- `worktree-evidence.tar.gz`: 93,441,293 bytes; SHA-256 `d29c0059aae9e8afc3783d871573314409550c58274d95facb7afe205ab35755`.
- `lead-review-evidence.tar.gz`: SHA-256 `f3793364088ac508e3b1f8075a1bc52b851e9455183b25c52e265b4a4ad25d9e`.
- `repository.bundle`: SHA-256 `f4ceb5abd4e9fa89d8c0ec751f506013a65e3959f7aed908e2f659f2f8f09523`.

The archive preserves the implementation's original package/lock baseline, source, fixtures, ignored red/green logs, installed-package checks, parent 0.3.0 verification and the actual deployed 0.2.0 archive. Its README records recovery. The completed source worktree and merged local branch were retired after the final unchanged-source audit.
