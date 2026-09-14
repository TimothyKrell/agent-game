# TIM-5 — Workspace cleanup

Completed on 14 September 2026 against integrated baseline
`c74b915f427def75681ed0c8f323c75768914e1c` (merged PR #9).

Tracked in [TIM-5](https://linear.app/tims-stuff/issue/TIM-5/reconcile-stale-worktrees-and-branches-establish-the-current-main).
The [execution plan](https://linear.app/tims-stuff/document/replay-clarity-and-frontend-modernization-execution-plan-a9609c9fc06c)
is the canonical backlog for this work.

## Result

- Retired 11 obsolete linked worktrees; the primary checkout is based on current main.
- Removed 15 obsolete local branches and seven merged remote branches.
- Created three short-lived issue worktrees for the approved first batch.
- Preserved all original committed history, uncommitted work, native design sources,
  local configuration and ignored release artifacts before removal.
- Reused installed dependencies: the old-to-current lockfile difference only changes
  the package version, with no dependency changes.
- Current-baseline `npm run typecheck`, `npm run lint` and `npm run build` pass.

The original inventory had 12 worktrees and 16 local branches. The primary checkout
was 81 commits behind current main; the old local `main` ref was 90 commits behind.

## Preservation and recovery

Local preservation root:

```text
/home/timothykrell/Code/agent-games-archive/TIM-5-2026-09-14/
  inventory.json
  retirement.json
  remote-retirement.json
  repository.bundle
  primary-uncommitted.bundle
  snapshots/<old-directory>.tar.gz
  snapshots/<old-directory>.manifest.json
  git-evidence/
  native-design/
```

The archive directory is mode 0700. Each snapshot includes tracked, untracked and
ignored files, excluding `.git` and reinstallable `node_modules`. Git objects and
refs are preserved in `repository.bundle`. Every regular archived file and symlink
was compared with its source, and the complete source file set was checked again
immediately before retirement. The manifests record SHA-256 hashes, modes and
symlink targets; the inventory also records archive and bundle hashes.

The primary checkout's strategy and research edits additionally remain in the
named stash `TIM-5 preserved primary strategy and research work (2026-09-14)`:
`c450a5bb59206dfec00533f3190bddaeb45b6c40`. Its complete history is independently
saved in `primary-uncommitted.bundle`. Restore into a separate recovery checkout
based on the old commit rather than applying the stash blindly to current main.

For example, inspect old committed work without altering the active checkout:

```bash
git clone /home/timothykrell/Code/agent-games-archive/TIM-5-2026-09-14/repository.bundle /tmp/opencode/TIM-5-recovery
git -C /tmp/opencode/TIM-5-recovery switch feat/succession-ui
```

To recover a full old working directory, extract its corresponding snapshot into
an empty recovery directory. The snapshot contains its working files; the git
bundle provides the matching repository history. `inventory.json` maps each old
path to its branch, HEAD, snapshot and manifest.

Native design sources are directly readable at:

```text
/home/timothykrell/Code/agent-games-archive/TIM-5-2026-09-14/native-design/figma/luminous-deco/
```

Historical documents referencing `agent-games-art-deco/design/...` resolve through
this preserved `native-design/...` tree. Existing frozen evidence under other
`/tmp/opencode` paths was not part of worktree retirement.

## Worktree disposition

| Original directory                     | Disposition                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| `agent-games`                          | Retained; primary research/strategy edits preserved; advanced to current main baseline |
| `agent-games-art-deco`                 | Archived and retired; native design has a readable preserved copy                      |
| `agent-games-figma-ui`                 | Archived and retired; PR #4 merged                                                     |
| `agent-games-local-game-controls`      | Archived and retired; PR #9 merged                                                     |
| `agent-games-motion`                   | Archived and retired; PR #5 merged                                                     |
| `agent-games-shape-fixes`              | Archived and retired; PR #8 merged                                                     |
| `agent-games-succession`               | Archived and retired; PR #7 merged                                                     |
| `agent-games-succession-cli`           | Archived and retired; integration commits reconciled                                   |
| `agent-games-succession-engine`        | Archived and retired; provider commit reconciled                                       |
| `agent-games-succession-platform`      | Archived and retired; integration commits reconciled                                   |
| `agent-games-succession-ui`            | Archived and retired; integration commits reconciled                                   |
| `/tmp/opencode/agent-game-ci-finalize` | Archived and retired; old main released for the primary checkout                       |

## Branch reconciliation

Nine original local branches, including main, were ancestors of current main.
Seven other Succession branches contained cherry-picked integration history.
Five were fully patch-equivalent. The three patch-unique commits on the remaining
two branches matched integrated commits as follows:

| Preserved commit | Integrated commit | Range-diff finding                                       |
| ---------------- | ----------------- | -------------------------------------------------------- |
| `fa948d3`        | `49264d6`         | Additional blank-line formatting in the old test patch   |
| `67726d6`        | `711b5fb`         | Blank-line/context differences in the old UI patch       |
| `d711763`        | `0235832`         | Old evidence patch additionally changed test blank lines |

The full comparisons are in `git-evidence/`. All original branch objects remain
in the verified bundle even after their live refs are removed.

The seven remote source branches for merged PRs #1–#5 and #7–#9 were retired only
after checking merged status, main ancestry and the exact archived SHA. Deletions
used an atomic push with per-ref expected-SHA leases. `main` is the retained
remote branch. `remote-retirement.json` records the PR-to-ref mapping.

## Active work convention

At first-batch start, the active issue worktrees are:

| Issue | Branch                              | Worktree                         |
| ----- | ----------------------------------- | -------------------------------- |
| TIM-6 | `design/tim-6-replay-prototype`     | `/tmp/opencode/agent-game-TIM-6` |
| TIM-7 | `diagnosis/tim-7-dialogue-baseline` | `/tmp/opencode/agent-game-TIM-7` |
| TIM-8 | `research/tim-8-frontend-seams`     | `/tmp/opencode/agent-game-TIM-8` |

The primary checkout coordinates integration. Branches, commits and PRs identify
their Linear issue. Each issue records its owned files, artifacts and verification.
One integrator owns shared dependency/lockfile changes. Retire a worktree when its
work is integrated or intentionally captured on a review/prototype branch, after
preserving any outstanding files and evidence.
