# TIM-30 — parent integration and CLI release preparation

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
