# TIM-27 local decision evidence

These small feasibility probes support
[`docs/design/TIM-27-playable-previews.md`](../docs/design/TIM-27-playable-previews.md).
They are not production implementations or hosted acceptance tests.

## Reproduce

Use the repository's installed locked dependencies (Better Auth **1.7.3**), Node
**24.21.0** used for these runs. Node's built-in SQLite requires a compatible recent
Node version. In this worktree `node_modules` is an untracked local symlink to the
parent's installation; no dependency or lockfile was changed.

```sh
node .tim27/auth-probe.mjs
node .tim27/import-probe.mjs
node node_modules/vitest/vitest.mjs run --config .tim27/vitest.config.mts
node node_modules/prettier/bin/prettier.cjs --write .tim27/*-result.json
node .tim27/provenance.mjs
node node_modules/prettier/bin/prettier.cjs --write .tim27/provenance.json
```

The Vitest include is deliberately scoped to `.tim27/runtime.test.mjs`; it starts no
Workers, provider, browser, supervisor, MCP server or listener. The auth probe invokes
real Better Auth handlers in memory. All origins, identities and credentials are local
fictional fixtures. Credentials are randomly generated in memory and never emitted or
persisted. Each command overwrites only its own sanitized result JSON here.

## Observed results

| Probe                                      | What actually runs                                                                                                                                                  | Result                                                                                                                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth-probe.mjs` → `auth-result.json`      | Locked Better Auth custom endpoint, internal session adapter, cookie setter, normal get-session; independent memory databases; native SQLite one-use exchange model | Fresh target session works, source/target cookies fail across secrets/DBs, target has no provider account. Explicit origin check, audience/incarnation/verifier, expiry/replay and source-revocation negatives pass.        |
| `import-probe.mjs` → `import-result.json`  | Actual `0001_initial.sql` + `0002_games.sql`, source and target SQLite, proposed allowlisted insert-only import                                                     | Stable IDs, repeated import, later source competitor, local edit/rating preservation and source/session/grant/match isolation pass.                                                                                         |
| `runtime.test.mjs` → `runtime-result.json` | Unmodified `PlatformQueue` on native SQLite, using the same storage-adapter approach as `tests/platform-queue.test.ts`                                              | Two independent coordinators each consider three $1.50 reservations affordable ($9 aggregate). Paid all-house full/half/eighth ceilings refuse excess. Mixed required $6 estimate is allowed; recording unknown retains $6. |

### Negative discoveries preserved in the executable probes

The first auth run incorrectly expected `trustedOrigins` alone to reject a cookie-less
foreign-origin custom plugin POST. It returned **200**, so the assertion failed at
`auth-probe.mjs:98` (`200 !== 403`). The final probe retains an unprotected no-op endpoint
that asserts the observed 200, and asserts 403 on the explicitly protected completion
endpoint. Production must apply an explicit origin check even before a cookie exists.

The auth probe also checks a target session remains locally valid after its source
session is deleted. The production design must introspect the source delegation on
every privileged use. Code redemption alone cannot satisfy ongoing revocation.

## Limits

- Source login uses local fixture email/password, not GitHub/Google. No provider callback,
  browser-cookie roundtrip, signed inter-Worker request, target key registration,
  distributed idempotency or native D1 transaction was tested.
- The import SQL model assumes collision-free validated metadata. It does not implement
  hostile-input handling, concurrent imports, pagination, authority refresh or media.
- The runtime probe checks real admission logic with directly seeded allocations and no
  provider call. It does not execute a game or evaluate model quality/real cost.
- `provenance.json` hashes the probes/results, reviewed core source and installed locked
  Better Auth implementation. Upstream links are in the decision document. All values
  in JSON evidence are nonsensitive aggregate results; no token/cookie/header is logged.
