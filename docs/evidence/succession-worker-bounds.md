# Succession actual Worker bounded-history evidence

## Scope and reproduction

Run `npx vitest run tests/succession-worker-bounds.test.ts`.

Observed on 2026-09-13: one actual Worker integration test passed; test body
190.968 seconds, total Vitest duration 194.26 seconds. This includes fixture
population and full archive traversal; it is **not** a hot-path latency benchmark.

The test boots the real Worker, D1, MatchmakingObject, MatchObject and preview
HouseSeatObject with isolated persistent local storage and ephemeral ports. Ten
external credentials join through the real queue. Decisions use only authorized
HTTP observations and advertised actions. Both acts complete through the real
engines. An actual deadline/grace expiration replaces an external seat with a
preview house, exercising the production house context and work-enqueue paths.

The canonical history contains 31,200 public chat messages of 1,000 four-byte
Unicode code points each (124,800,000 message-text UTF-8 bytes), plus 64
1,000-character messages containing NUL, backslash, quote and newline escapes.
Population uses MatchHistory in the actual match's SQLite store, in batches of
at most 64 events per RPC. It does not submit 31,200 live chats or model their
cooldowns. Normal engine events may append during setup; archive preservation
uses the actual canonical first/through positions rather than assuming contiguous
fixture-only history. The persisted Worker is stopped and restarted after setup.

## Instrumentation

`tests/fixtures/succession-worker-metrics.ts` decorates the **original** native
`ctx.storage.sql.exec` before calling the production MatchObject constructor.
Wrapping DurableObjectState itself in a Proxy is rejected by workerd's native
brand check, so the fixture retains the genuine context/storage/cursors.

- SQL statements and native cursor `rowsRead` / `rowsWritten` are recorded.
- Native cursor `toArray` and `one` retain their behavior and additionally record
  materialized row counts and JSON-serialized bytes. These are the materialization
  methods used by the inspected production paths. Index traversal can contribute
  to native `rowsRead`: a 64-row history-stream join reads 128 SQLite rows.
- A test-isolate `structuredClone` wrapper records maximum serialized clone input
  and the largest `events` array. This is an isolate-wide upper bound during each
  measurement interval, not a production heap profiler or per-object allocation
  attribution. In particular, asynchronous preview-house work can contribute.
- Game/checkpoint SQL writes are measured at their bound string values; current
  state/checkpoint reads are also constrained to 64 KiB including row/JSON escape
  overhead. Actual HTTP current, receipt/socket and replay sizes are constrained
  independently to 14, 16 and 32 KiB.
- Meter state is cleared between labeled operations and disabled during corpus
  population. Explicit archive traversal checks each page independently, rather
  than accumulating historical payloads in the measurement recorder.

No production files are replaced or patched. Setup clocks expire discussion or
grace deadlines; the fixture does not invent engine outcomes or house decisions.

## Captured measurements

Bytes below are JSON-serialized UTF-8 sizes. “Historical rows” means materialized
canonical events, replay facts or checkpoints; metadata/head reads are separate.

| Actual host operation                           | SQL statements | Historical rows | Max clone bytes | Max cloned events | Max state/checkpoint write bytes |
| ----------------------------------------------- | -------------: | --------------: | --------------: | ----------------: | -------------------------------: |
| Cold restarted private current                  |             33 |               0 |           6,150 |                 0 |                                0 |
| Repeated public/private current, reconcile, arm |             24 |               0 |           6,150 |                 0 |                                0 |
| Explicit production alarm                       |             15 |               0 |           6,150 |                 0 |                                0 |
| Socket connection/resync                        |             10 |               0 |           6,150 |                 0 |                                0 |
| Accepted action, save, enqueue, broadcast, arm  |            116 |               0 |           6,169 |                 0 |                            6,169 |
| Accepted-action receipt retry                   |             17 |               0 |           6,169 |                 0 |                                0 |
| Actual timeout takeover and enqueue             |            119 |               0 |           9,893 |                 0 |                            9,893 |
| Entitled house context                          |             13 |       64 events |          10,099 |                 0 |                                0 |
| Cold terminal current                           |             49 |               0 |               0 |                 0 |                                0 |
| Terminal indexed page                           |             12 |       64 events |               0 |                 0 |                                0 |
| Stale live epoch reset after termination        |             11 |               0 |               0 |                 0 |                                0 |
| Terminal replay                                 |              4 |    1 checkpoint |               0 |                 0 |                                0 |

Every core hot-path measurement asserts **no SELECT on events/replay tables**,
not merely a small returned page. All cloned `events` arrays in these measurements
were empty. Enqueue is reached through real action persistence and actual timeout
takeover; it is not invoked through a replacement implementation.

The entitled house-context SQL was an indexed stream/canonical join with `LIMIT`,
64 materialized events and 128 native rows read. Its row-serialization payload
was 20,979 bytes; its complete returned context was 21,597 bytes. The test enforces
the architecture's context limit of 64 events, each bounded by the canonical
8-KiB event limit, separately from the current observation limit.

The terminal page read used the canonical primary-key range and `LIMIT`, with
64 materialized rows and 64 native rows read. Its internal row serialization was
267,447 bytes: loading at most 64 maximum-sized events is intentionally distinct
from the **32-KiB wire page** limit, which trims the returned page by bytes. The
test does not claim a 32-KiB internal history-query allocation limit.

Observed cold current was 3,755 bytes; final replay was 5,765 bytes. Maximum
game/checkpoint row serialization among the recorded intervals was 11,511 bytes,
including escaping overhead, comfortably below 64 KiB. Terminal replay performed
one indexed checkpoint read; earlier archive-frame reconstruction is separately
covered by `tests/succession-worker.test.ts`.

## Complete archive preservation

After actual overall termination and another Worker restart, the test walks the
entire seeded canonical range through the production HTTP history endpoint.
Each call checks monotonic cursor progress, at most 64 materialized canonical
rows, at most 128 native rows read, and at most 32 KiB on the wire. It compares
every fixture message with its exact original Unicode/escaped text and recovers
**31,200 Unicode messages and 64 escaped messages**, with no whole-history copy.

This complete traversal is an explicit preservation check, not a current/load/
reconcile benchmark. The reproducible raw measurement output is written to
`/tmp/opencode/succession-worker-bounds-results.json`; the table above preserves
the measured evidence in the repository without committing environment-specific
temporary data.
