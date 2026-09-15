# TIM-27 — unit shard runtime budget

The expanded integration tests require more CI headroom. The parent changes only `jobs.unit.timeout-minutes` from15 to25, retaining three shards, one worker per runner, all seven required verification-job names and every existing test/game timing and assertion.

The independent analysis pins018ceec; documentation-onlya90188f has the same test inventory and CI configuration. Vitest4.1.11's `list --filesOnly --shard=N/3` returns the entire list because its listing path bypasses partitioning. Applying the installed `BaseSequencer.shard()` yields66 files,22 per shard, each exactly once.

| Shard | Measured files | Observed whole-file runtime | With120s planning overhead |
| ----- | -------------: | --------------------------: | -------------------------: |
| 1/3   |          22/22 |                    495.325s |                     10m15s |
| 2/3   |          22/22 |                    377.301s |                      8m17s |
| 3/3   |          22/22 |                    638.608s |                     12m39s |

These sums use the latest supplied completed report for overlapping files and whole-file log durations, including hooks. No current file is unmeasured. The earlier769-test/88-suite report comprises59 files; suite counts are not file counts. API tests and hidden diagnostic failures are excluded by the actual unit configuration.

The largest shard contains `preview-playable.test.ts` at462.426s, `preview-finalizer.test.ts` at60.663s and `history.test.ts` at59.039s. Its old15-minute job limit leaves only2m21s after the planning overhead. A1.221× change in measured runtime consumes that margin. Sensitivity calculations give17m58s at1.5× and23m17s at2×; these are scenarios, not hosted-runtime predictions.

Historical hosted run34766041939 records39–44s setup,1–2s build and49–52s outside the unit step. Local runner/import overhead was23.79s. The120s allowance covers these costs and artifact upload without claiming a new hosted measurement. Local hardware has32 CPUs; historical hosted logs show two. CPU ratios do not directly predict the timed-game, Worker and SQLite workload.

The playable file alone permits390s,390s,90s,120s and60s across its five existing cases, totaling1,050s before hooks. The former900-second job could terminate individually in-budget tests. The scoped25-minute CI limit accommodates that integration workload; it adds no inference allowance and changes no game clocks.

Evidence and reproducible allocation/calculation scripts: `/tmp/opencode/TIM-CI-shard-budget-57dx55yw/`. This is a runtime-budget projection, not a CI pass. Current hosted performance and the pending smoke-classification correction remain to be measured by actual CI.
