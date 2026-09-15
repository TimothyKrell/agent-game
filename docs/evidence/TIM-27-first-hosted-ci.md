# PR10 — first GitHub CI run

Run **34957418324**, attempt1, tested branch head **debd8a4a071bc43483b6af8be463e1904d169efc** via GitHub merge commit **93c617e3866e44eaa062bc578b96aec04b1f19fb** against main **c74b915f427def75681ed0c8f323c75768914e1c**.

## Results

| Job                                                               | Result                                    |
| ----------------------------------------------------------------- | ----------------------------------------- |
| Verify: lint, format, types, build, dry-run and prebuilt producer | Passed                                    |
| Browser and motion                                                | 153 passed,13.0m                          |
| API and recovery                                                  | 6 passed                                  |
| Production provider transport                                     | Passed using the local synthetic provider |
| Unit shard1                                                       | 458 passed,1 failed                       |
| Unit shard2                                                       | 201 passed                                |
| Unit shard3                                                       | 196 passed,5 failed                       |
| Production deployment                                             | Skipped for the pull request              |

The unit inventory totals **861 cases:855 passed and6 failed**. This run is not eligible for trusted preview deployment.

## Browser prerequisite correction

The only shard1 failure was the two-origin preview cookie continuation test. `chromium.launch()` could not find the pinned Playwright headless-shell executable on the fresh runner. The unit job installed packages but not browser binaries; the separate browser job correctly installed its own copy.

The unit job now runs the same `playwright install --with-deps chromium` prerequisite. It applies to all shards so future file repartitioning cannot strand the browser-dependent case. Its assertions and fixtures remain unchanged. Existing workflow-boundary tests pass after the configuration change; the next GitHub run will verify the fresh-runner installation.

## Playable failures remain under diagnosis

All five installed playable-preview cases failed on shard3. The completed Secret Overlord journey forfeited its original entrant; Succession remained active at its completion assertion with the original entrant already taken over. Later cases reported recovery/pinned-identity errors and a duplicate fixture-fault key. These observations are preserved individually; a shared cause or cascade has not yet been established.

The diagnosis uses a separate worktree with explicitly local providers and reduced-CPU reproduction. Successful local runs do not close the hosted findings. Completion, forfeiture, authority, accounting and pinning assertions remain required.

## Content verification and retention

The actual GitHub prebuilt artifact passes the accepted content validator: **29 payloads /4,541,672 bytes**. Its manifest hash is `044fa9276d9e56c6b459f580a2cab041c41d046df1650df2f6138c82bfade2c7`. Built/base/head identities agree with GitHub's recorded job-step name. The normalized0.3.0 executable is53,767 bytes with SHA-256 `a0d4f7b0199efa6144c2fa84f51116820d747d575643afc63edf2b13cf24e635`, matching the accepted local preparation artifact. Content validity does not override failed CI or attest a hosted release.

All available GitHub artifacts, failed-step logs, job metadata and completed watcher output are retained under `/tmp/opencode/TIM-27-pr10-ci/`. The exact tested merge commit is also retained under `refs/evidence/pr-10-ci-34957418324` for recovery.

**Retention boundary:** the initial workflow uploaded unit reports and logs but omitted playable native temporary state. That original remote state is unavailable. The corrected workflow retains existing identity/broker/playable evidence directories and `/tmp/opencode/tim27-playable-*`, including hidden fixture state, on success or failure. Original downloaded reports remain unchanged.

Recovery archive: `/home/timothykrell/Code/agent-games-archive/PR-10-CI-34957418324/`, preserving865 entries and the exact tested merge commit in a verified Git bundle. All member hashes, unchanged originals and independent source recovery pass. Evidence archive SHA-256 `5676c9c4520a53c5c0b3c1afe9166b727036be1aa3e57155b9503d7f4ab1dcfb`; bundle `34d731613c126373a7e397a48d509007cb317ed366b5872b7e312bfeaf72687f`.
