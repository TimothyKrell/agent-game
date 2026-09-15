# Historical implementation evidence

The authored summaries here record historical implementation decisions and observed
runs. Inline commands, paths, test counts and preservation statements describe those
runs; they are not current operating instructions.

Raw ticket reports and retired helpers in `.tim*` and `.dossier*` directories were
removed from the working tree during the 2026-09-15 cleanup. Previously tracked
files remain available at [commit `1f1177a`](https://github.com/TimothyKrell/agent-game/tree/1f1177a323c1619766e356543038711524d578e7);
historical report links pin that commit. A verified local snapshot is at
`/home/timothykrell/Code/agent-games-archive/tracked-fixture-cleanup-2026-09-15/`.
Its `tracked-ticket-files.tar.gz` contains the old repository-relative paths;
`manifest.json` identifies their Git blob IDs and SHA-256 hashes.
This snapshot covers tracked files, not every ignored local run mentioned in a summary.

For maintained fixtures and current helper commands, see
[maintained test support](../../tests/fixtures/README.md). Current CI diagnostics
and retention are described in [CI and deployments](../ci.md#diagnostics-and-preview-delivery).
This historical index adds no requirement to create future archives or manifests.
