# TIM-27 — immutable CLI packaging

The parent found two release-preparation defects while comparing the accepted installed-playable evidence with the integrated build:

1. The packager copied retained releases into `public/downloads`, then packed the current version directly into that same directory. A retained filename matching the application version could be overwritten with changed bytes.
2. Identical package contents inherited local filesystem permissions. Three Succession text files were0644 in a clean worktree and0600 in the parent, producing53,767-byte and53,775-byte archives with different digests despite identical18 regular-file contents.

## Correction

`scripts/package-cli.mjs` normalizes only staged package files, preserves the executable entrypoint and rejects nonregular staged entries. It packs into its temporary directory. A same-filename retained release must match the candidate byte-for-byte; otherwise the build fails before publishing the candidate. Unchanged retained releases stay intact, and a version bump permits a new archive. Temporary staging is removed on success or failure.

No CLI runtime, package version or dependency changed. Retained0.1.1 and0.2.0 hashes match their original records in `cli/releases`, `public/downloads` and `dist/client/downloads` after the build. The normalized0.3.0 archive matches the accepted source-playable archive exactly:18 regular files,53,767 bytes, SHA-256 `a0d4f7b0199efa6144c2fa84f51116820d747d575643afc63edf2b13cf24e635`.

## Actual packaging verification

`tests/cli-release.test.ts` invokes the actual packaging script and `npm pack --ignore-scripts` from isolated fixture checkouts and homes, with only PATH retained from the parent environment. It preserves fresh evidence and starts no providers or game sessions.

- **Baseline: both cases fail.** Changing only a text-file permission changes the archive hash. Adding a CLI module at a retained version exits successfully and overwrites the public archive.
- **Correction: both cases pass.** Permission changes produce identical archives; unchanged retained releases rebuild successfully; changed payloads fail while preserving the released bytes; a version bump publishes a new archive and retains every older release.
- Initial green runtime tests preceded a TypeScript failure caused by generated Worker fields extending `ProcessEnv`. The fixture now clears a correctly typed environment copy before spawning. Spacing lint failures were corrected separately; their raw command outputs remain available.
- Final typecheck, lint, formatting, actual package tests, application build and whitespace checks pass. A separate tar inspection verifies all18 regular entry modes and the immutable historical release hashes.

Evidence: `/tmp/opencode/TIM-27-release-red/`, `TIM-27-release-green/`, `TIM-27-release-final/`, their corresponding JSON/log reports, and `TIM-27-release-validation.json`. The original failed reports remain unchanged. Version0.3.0 remains un-released preparation pending trusted source publication and hosted attestation.
