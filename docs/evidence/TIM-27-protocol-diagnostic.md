# TIM-27 — historical missing protocol-header diagnostic

## Conclusion

**A matching failure mode is reproduced and attributed in the current environment: an unsolicited loopback `GET /` from `moshi-hook` reaches a synthetic fixture whose async request listener asserts the protocol header on every request.** The request has no `X-Agent-Game-Protocols` header. The assertion rejects outside the test's awaited work, so Vitest reports passing test assertions **plus an unhandled rejection**.

The historical incident can be classified precisely as that kind of **synthetic-fixture assertion rejection**, rather than a captured production HTTP negotiation error. Its particular request remains **unattributed**: the old log recorded neither method/path nor headers/peer. Current listener-only reproduction is strong evidence for a plausible environmental explanation, not retrospective proof that the old packet came from the same process. No CLI header-removal defect was observed in the concrete negative probes, and this investigation does not label the old incident “fixed” by the separately accepted wake, timeout, or HTTP-401 corrections.

Diagnostic base: `508bbef73cbe8726829752baea3aaab0d78b1905`, branch `diagnose/tim-27-protocol-header`. This lane adds only isolated diagnostic probes and evidence. The original playable worktree and archived source are quiescent.

## Original signal and provenance

The reviewer copy and the two archived copies of `.tim27-cli/regressions.log` are byte-identical: **11,284 bytes**, SHA-256 `b7e8624e5d6c03a0fb70cac61731070ebd1561f4bd938f43dec6e6c47679da40`.

Sources checked read-only:

- `/tmp/opencode/TIM27-cli-spec-review/b42248e-4un18tta/review-evidence/regressions.log`, with its existing `provenance.json` hash.
- `/home/timothykrell/Code/agent-games-archive/TIM-27-cli-2026-09-15/worktree-evidence.tar.gz`, exact member `.tim27-cli/regressions.log`.
- The adjacent `lead-review-evidence.tar.gz`, exact member `TIM27-cli-spec-review/b42248e-4un18tta/review-evidence/regressions.log`.

Original lines 62–86 contain:

```text
Unhandled Rejection
AssertionError: expected undefined to be '1,2' // Object.is equality
Server.<anonymous> tests/cli-succession.test.ts:610:55
  expect(request.headers['x-agent-game-protocols']).toBe('1,2');
Server.emit node:events:514:28
parserOnIncoming node:_http_server:1293:12
HTTPParser.parserOnHeadersComplete node:_http_common:125:17
Tests 92 passed; Errors 1 error
```

The named latest test was `preserves selected game through first pairing and start recursion, then copies the exact action envelope`. Its server checks the header **before routing**, and its `createServer(async (...) => ...)` promise rejection is not awaited by Node's event emitter. The log contains no HTTP status, response body, request URL/method, or peer record for the rejected request. No historical packet was recovered from the designated retained evidence. A later diagnostic added request metadata, but that later run did not reproduce the rejection.

`854eeae` is the historical implementation before the diagnostic test edit; `b42248e` changes neither its CLI, packaging script, nor package manifest. Both declare 0.3.0. Exact source-file hashes are in `accepted/manifest.json`. The 0.2.0 comparison uses the actual retained release archive (SHA-256 `47bf567f9609a47c2b5267a11a697a2181b614b022591ec9d13351733cc0056f`), extracted directly without installing packages.

The historical rejection does not identify an executable or installed archive hash either. These versioned negative probes compare preserved code; they cannot identify which process or binary sent the unrecorded old request.

## Tight reproduction and reduction

The first wire-matrix attempt unexpectedly received two extra requests while the actual CLI's `/api/queue` requests all carried `1,2`. The extra requests were `GET /`, user agent `Go-http-client/1.1`, no authorization and no protocol header. Its original blanket-assertion detector rejected them; the capture is preserved at `accepted/probe-lMuYFA/result.json`.

Removing **all CLI execution and all generated HTTP requests** retained the failure:

```sh
node .tim27-protocol/listener.mjs --peer
```

The listener-only captures received an unsolicited request after 2,139 ms and 977 ms. The second records this decoded request (this is a reconstruction from Node request fields, not a pcap):

```http
GET / HTTP/1.1
Host: 127.0.0.1:46773
User-Agent: Go-http-client/1.1
Connection: close
Accept-Encoding: gzip
```

The live TCP connection was `127.0.0.1:52128 → 127.0.0.1:46773`. An exact-port `ss -tnp` capture identifies the client as `moshi-hook`, PID 99388, and the listener as Node's `MainThread`. This attribution uses socket ownership rather than the user-agent string, process environment, or credentials. It identifies the current sender, not its internal purpose or the historical sender.

The listener command exits **1** when the original equality assertion rejects. It exits **2** if no unsolicited request arrives within five seconds; absence is not a fix result. The `--scoped` variant returns 404 for non-API requests before enforcing the header assertion. It observed the same sender/request and exited 0.

### Exact Vitest unhandled-rejection shape

The dedicated diagnostic test preserves the original async-listener/`expect` pattern and makes no HTTP calls or CLI invocations:

```sh
node node_modules/vitest/vitest.mjs run --config .tim27-protocol/vitest.config.mjs
PROTOCOL_SCOPED_FIXTURE=1 node node_modules/vitest/vitest.mjs run --config .tim27-protocol/vitest.config.mjs
```

- Original blanket variant: **one test passed plus one unhandled rejection**, exit 1, in 834 ms. Error text is exactly `expected undefined to be '1,2'`; the Node parser stack frames match the old log. The newly captured request was the unsolicited root probe.
- Scoped fixture variant: the root probe was actually observed; **one test passed, no unhandled error**, exit 0, in 613 ms. This is a diagnostic fixture mitigation, not a production-code fix or a declaration that the historical request has been identified.

The diagnostic test is outside the normal test include pattern and intentionally fails when the environmental request triggers the original assertion. Its scoped variant also fails if no ambient request is observed, preventing an absent probe from being counted as mitigation evidence. Raw outputs are in `accepted/async-red/`, `accepted/async-scoped/`, and their referenced `blanket-*` request captures.

## Concrete candidate checks

These probes use the actual exported CLI/supervisor bytes, real Node loopback HTTP, OS-assigned ports, fresh local homes, and the data literals from the historical test. They do not use production authorities or an inference service.

| Candidate / command                               | Evidence and result                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node .tim27-protocol/probe.mjs pairing`          | Replays the original `start --game succession`, `start`, `observe`, `act --choice 0`, conflicting-game sequence on `854eeae` and `508bbef`. Seven API requests per version; every one has `1,2`. The approval URL is loopback instead of the old unused external fixture URL.                                                                                                           |
| `node .tim27-protocol/probe.mjs websocket`        | Actual old/current `GameClient.connect` sends a headerless WebSocket upgrade with `?protocol=2`. Without an upgrade handler, Node delivers it to the blanket request assertion, which rejects. The preceding ordinary observation HTTP has `1,2`. This is another concrete way the blanket assertion can fail, but the old named pairing test does not itself call `wait` or `connect`. |
| `node .tim27-protocol/probe.mjs wire-matrix`      | Success, retryable 503, JSON 401 and malformed 401 against released 0.2.0, historical `854eeae`, corrected `f932a0e`, and current `508bbef`: **24 ordinary API HTTP requests; all have `1,2`**. Ambient root traffic remains recorded and cannot consume an API response fault.                                                                                                         |
| `node .tim27-protocol/probe.mjs native`           | Actual `supervise` and native Claude/OpenCode adapter subprocesses on historical/current source, with local executable stubs executing the copied CLI's `observe`/`act`/`observe`. Four completed synthetic journeys, one invocation each, **24 API HTTP requests; all have `1,2`**. Old-source OpenCode also received ambient root probes, separately recorded.                        |
| `node .tim27-protocol/negotiation.mjs`            | Eight checks call the actual pure production `requireGameProtocol` after local bundling. Missing/protocol-1 Succession headers produce **HTTP-status 426 / `protocol-upgrade-required`** errors; headers containing 2 pass. Secret Overlord accepts the legacy cases. This differs from the historical Vitest equality assertion. No server/provider is started.                        |
| `node .tim27-protocol/probe.mjs detector-control` | Deliberately sends an API request without the header and exits 1. This validates detection sensitivity; it is explicitly not a reproduction of the historical request.                                                                                                                                                                                                                  |

Across the pairing, wire, native and WebSocket-comparison probes, **64 ordinary API HTTP requests** carried `1,2`. Legitimately headerless upgrades and unsolicited root requests are reported separately. These are bounded candidate checks, not a broad claim that all possible runtime paths are correct.

### What the accepted fixes do and do not establish

Both old and current `GameClient.request` synchronously construct `X-Agent-Game-Protocols: 1,2` for every attempt. Their supervisor HTTP transport does likewise. The accepted `cli/http-response.mjs` is byte-identical between `f932a0e` and `508bbef`.

The wire matrix confirms a real, already-accepted response-decoding difference: malformed 401 on 0.2.0/`854eeae` retries three times and surfaces a `SyntaxError` without status; `f932a0e`/`508bbef` preserves 401 in one attempt. **Every request in both behaviors still carries the header.** This does not establish that the 401 change fixed the old rejection.

The native probes use an explicitly integral fixture clock to avoid conflating the previously demonstrated fractional `execFile` timeout defect with this header investigation. That is a controlled clock override, not a modification of old production code. The original test's epoch-zero current-frame timestamp was adjusted to present time only in these native probes, so the supervisor has an actual allowance. An initial native probe used the old zero timestamp and exhausted its allowance; another fixture iteration exposed CommonJS executable text under the exported ESM package. Those setup failures are retained in ignored `runs/probe-a5mypW/` and `runs/probe-IsDdut/`; neither is a missing-header finding.

## Actionable handoff and remaining limit

The existing synthetic fixture at `tests/cli-succession.test.ts:609–618` should assert protocol headers on the intended API traffic, while rejecting/handling unrelated routes before that assertion; WebSocket negotiation belongs to its own upgrade/query contract. Async handler assertions should be delivered into awaited test work so failures cannot hide behind a passing test count. The dedicated scoped diagnostic demonstrates the narrow root-routing mitigation. The existing test and all production implementation files remain unchanged in this lane.

**Historical request-level attribution requires the original method/path/header/peer packet, which the preserved log does not contain.** The strongest supported conclusion is: a matching unhandled fixture failure is now reproducible from an identified environmental sender; the tested ordinary CLI/native/negotiation paths do not show header omission. Do not relabel the historical incident as fixed by the CLI runtime corrections.

## Evidence and validation

Every run uses a unique `.tim27-protocol/runs/` directory. Selected raw JSON/log captures, historical error excerpt, source versions, and byte-copy hashes are committed under `.tim27-protocol/accepted/`. `capture.mjs` verifies the historical log against reviewer provenance and both archives without extracting or changing original state. Unselected setup/failure runs remain preserved locally.

Dependencies are existing root packages linked individually into a worktree-local `node_modules` directory with local cache locations; no install or root package/lock change was made. Native commands receive fresh homes and an allowlisted environment. Captures redact authorization values. All network probes bind loopback OS-assigned ports; no assigned CLI/playable/browser port is used. Provider calls and paid inference calls are **zero**.

Validation is limited to these diagnostic probes, scoped lint/format, syntax checks, and production-scope diff verification. No broad test-suite rerun is used as evidence for a historical fix.
