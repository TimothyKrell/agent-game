# TIM-26 integration and evidence recovery

TIM-26 is integrated on `integration/replay-modernization` at
`73ca5627bfcd1a699650cd77d9c4e887a475ab06`. Its five original commits, from
`c38b4d0` through `19d39a2022f0492e43eb72a34546761d4f46d095`, remain in the merge
history. The implementation and detached comparison worktrees were retired after
archival and independent recovery verification.

## Acceptance

- **Standards:** zero findings.
- **Spec/correctness:** zero outstanding findings. Obsolete waiter retirement and
  slow housekeeping delaying required actions were corrected and independently
  checked.
- Lead ran all **17 real Worker/SQLite lifecycle and deadline cases**. Ready,
  future and arriving saved required responses submit on time while cleanup stays
  unresolved; cleanup retains exact-ID identity, replacement priority and usage.
- Lead reran the full budget gate: **phase 178 finished, all 392 required choices
  exactly match the normalized baseline, zero required refusals, $1.2804700** in
  fixture charges. There are 412/488 initial activations and 154 follow-ups.
- **64 combined-branch unit cases**, typecheck, lint, build, scoped formatting and
  whitespace checks pass. The implementation agent also passed the final
  required-pressure cold-retry control and three provider/receipt regressions.

The existing $1.50 match / $5 daily framework is unchanged. Synthetic-provider
results establish exercised opportunity, accounting and recovery behavior;
real-model response quality and hosted dialogue remain under TIM-14 and TIM-27.

Implementation, measurement assumptions, negative controls and commands:

- [Dialogue opportunities](../evaluation/TIM-26-dialogue-opportunities.md)
- [Budget and recovery review](../evaluation/TIM-26-budget-review.md)

## Preserved archive

Local archive:
`/home/timothykrell/Code/agent-games-archive/TIM-26-2026-09-14/`.

| Artifact                    | Contents                                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `worktrees-evidence.tar.gz` | Complete implementation and comparison snapshots, including all `.tim7` traces, red/green runs and fixture adaptations       |
| `lead-evidence.tar.gz`      | Parent logs, independent normalized-choice/accounting results, original reviewer reproducer, archive script and git metadata |
| `repository.bundle`         | Complete implementation and integration history                                                                              |
| `manifest.json`             | Every archived entry's hash or symlink target, original evidence checks, bundle hash and acceptance summary                  |
| `metadata/`                 | Exact worktree heads, status and binary/staged diffs, including the intentionally dirty baseline comparison                  |
| `bundle-recovery/`          | Independently cloned bundle used to verify commits and selected source bytes                                                 |

All **1,603 snapshot entries** and **22 lead/metadata entries** were read back and
hash-verified. Original evidence manifests still match: 30 budget, 27 waiter,
37 cleanup and eight baseline-comparison hashes. Immediately before retirement,
all source entries and both git statuses were rechecked against the archive.

Snapshot archive: 224,067,940 bytes; SHA-256:

```text
135c6ba4b8c503f6d1176cc61333c9d682428ea83ff52f35f5c0ac56c0cba184
```

Only `.git` pointers, reinstallable `node_modules` and `npm-cache` were excluded.
History and dirty state have separate durable copies in the bundle and metadata.

## Recovery

Clone `repository.bundle` into a fresh directory and check out the desired
original commit. Restore `worktrees-evidence.tar.gz` into another fresh directory:
`implementation/` and `comparison/` reproduce the original source and evidence
trees. The comparison intentionally uses old production files alongside its
measurement adaptations; its exact dirty state is preserved rather than assumed
to match its detached commit.

Verify restored bytes against `manifest.json`. Reinstall the locked dependencies
when running a recovered fixture. Commands in the evaluation notes that name
retired `/tmp/opencode/agent-game-TIM-26*` paths must use the restored paths.

The retained TIM-6 prototype worktree and new TIM-27 worktree were not part of
this retirement.
