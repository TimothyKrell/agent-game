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

The timeout-takeover interval is the exception to the strict zero-SELECT assertion:
it **observed zero historical reads** in this run, but permits bounded history reads
because asynchronous entitled house-context calls can start within that interval.
The dedicated house-context and explicit page/replay intervals likewise assert
bounded indexed reads rather than zero reads. This allowance does not apply to
the external current, action, receipt, socket or terminal-current measurements.

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
`/tmp/opencode/succession-worker-bounds-results.json` in the initial capture; the table above preserves
the measured evidence in the repository without committing environment-specific
temporary data.

Subsequent test runs default to a process-specific
`/tmp/opencode/succession-worker-bounds-results-<pid>.json` and print its path.
`SUCCESSION_BOUNDS_RESULTS_PATH` can select an explicit output path. The initial
platform capture was also retained as
`/tmp/opencode/succession-worker-bounds-platform-d4dafd8.json` before the lead rerun.

## Small-history comparison

A focused actual-Worker baseline passed independently in 17.604 seconds, including
finishing that separate small match through both real engines to leave no active
background match. Command:
`npx vitest run tests/succession-worker-bounds.test.ts -t 'small-history'`.
The large-corpus test also now records the same public/private current pair before
population for future same-match comparisons. This follow-up did not repeat the
125-MB traversal; the large measurements below are the successful earlier capture.

| Public/private current pair                | SQL statements | Historical rows | Clone calls | Max clone bytes | Max cloned events | Max state write bytes |
| ------------------------------------------ | -------------: | --------------: | ----------: | --------------: | ----------------: | --------------------: |
| Fresh small history (<64 public events)    |             24 |               0 |           2 |           6,172 |                 0 |                     0 |
| After 31,200 Unicode + 64 escaped messages |             24 |               0 |           2 |           6,150 |                 0 |                     0 |

Small-history public/private wire sizes were 3,581 / 3,762 bytes. Large-history
cold private current was 3,755 bytes. Separate random game identities and phases
explain small constant-size differences; these figures demonstrate bounded work
and no history-scaled cloning, not statistical latency equivalence.

Small-baseline raw counters use the dictionary and tuple convention below:

```text
{"name":"small-history-current","cloneCalls":2,"cursors":[[18,1,0,1,6885,4],[19,1,0,1,110,4],[19,1,0,1,27,2],[21,1,0,1,75,2],[23,1,0,1,10,2],[19,1,0,1,15,2],[24,1,0,0,2,2],[25,1,1,0,0,2],[19,1,0,1,955,1],[20,0,0,0,2,1],[22,1,0,0,2,1],[21,1,0,1,79,1]]}
```

## Durable native cursor capture

The following captures every cursor counter from the measured intervals above.
Repeated identical counter tuples are stored with a multiplicity; statement order
and parameter values are omitted. No counters are averaged or sampled. Each tuple
is `[statementId, rowsRead, rowsWritten, materializedRows, materializedBytes, count]`.
Clone maxima are in the table above; clone call counts are retained below. Byte
counts include JSON serialization of the returned row/array, so an empty array
occupies two bytes. These are the raw counters from the successful run, not limits
substituted for observations. Background alarm statements within an interval are
included, explaining outbox reads in the terminal-current measurement.

### Statement dictionary

```text
0 CREATE TABLE IF NOT EXISTS game (id INTEGER PRIMARY KEY CHECK(id = 1), data TEXT NOT NULL)
1 CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, data TEXT NOT NULL)
2 CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)
3 CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL)
4 CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, data TEXT NOT NULL, delivered INTEGER NOT NULL DEFAULT 0)
5 CREATE TABLE IF NOT EXISTS socket_tickets (hash TEXT PRIMARY KEY, seat INTEGER NOT NULL, grant_id TEXT NOT NULL, grant_expires INTEGER NOT NULL, expires_at INTEGER NOT NULL)
6 PRAGMA table_info(socket_tickets)
7 CREATE TABLE IF NOT EXISTS revoked (grant_id TEXT PRIMARY KEY)
8 CREATE TABLE IF NOT EXISTS replay_frames (id INTEGER PRIMARY KEY, data TEXT NOT NULL)
9 CREATE TABLE IF NOT EXISTS replay_facts (id INTEGER PRIMARY KEY, data TEXT NOT NULL)
10 CREATE TABLE IF NOT EXISTS history_rounds (act INTEGER NOT NULL, round INTEGER NOT NULL, through_id INTEGER NOT NULL, event_key TEXT NOT NULL, PRIMARY KEY (act, round))
11 CREATE TABLE IF NOT EXISTS history_heads (name TEXT PRIMARY KEY, head INTEGER NOT NULL, epoch TEXT NOT NULL)
12 CREATE TABLE IF NOT EXISTS history_streams (stream TEXT NOT NULL, seq INTEGER NOT NULL, event_id INTEGER NOT NULL, PRIMARY KEY (stream, seq))
13 CREATE TABLE IF NOT EXISTS history_cutoffs (seat INTEGER PRIMARY KEY, seat_head INTEGER NOT NULL, public_head INTEGER NOT NULL)
14 CREATE UNIQUE INDEX IF NOT EXISTS events_event_key ON events(json_extract(data, '$.eventKey'))
15 CREATE UNIQUE INDEX IF NOT EXISTS history_stream_events ON history_streams(stream, event_id)
16 CREATE TABLE IF NOT EXISTS __miniflare_do_name (id INTEGER PRIMARY KEY, name TEXT)
17 INSERT OR REPLACE INTO __miniflare_do_name (id, name) VALUES (1, ?)
18 SELECT data FROM game WHERE id = 1
19 SELECT value FROM meta WHERE key = ?
20 SELECT grant_id FROM revoked WHERE grant_id = ?
21 SELECT name, head, epoch FROM history_heads WHERE name = ?
22 SELECT seat, seat_head, public_head FROM history_cutoffs WHERE seat = ?
23 SELECT id FROM game WHERE id = 1
24 SELECT id FROM outbox WHERE delivered = 0 LIMIT 1
25 INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value
26 SELECT id, data FROM outbox WHERE delivered = 0 LIMIT 30
27 SELECT fingerprint FROM receipts WHERE id = ?
28 INSERT INTO events (id, data) VALUES (?, ?)
29 INSERT INTO history_streams (stream, seq, event_id) VALUES (?, ?, ?)
30 UPDATE history_heads SET head = ? WHERE name = ?
31 INSERT INTO replay_frames (id, data) VALUES (?, ?)
32 INSERT INTO replay_facts (id, data) VALUES (?, ?)
33 INSERT OR IGNORE INTO history_rounds (act, round, through_id, event_key) VALUES (?, ?, ?, ?)
34 INSERT INTO game (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data
35 INSERT INTO receipts (id, fingerprint) VALUES (?, ?)
36 SELECT data FROM game WHERE id=1
37 UPDATE game SET data=? WHERE id=1
38 INSERT INTO meta(key,value) VALUES ('alarm-due',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value
39 INSERT OR IGNORE INTO history_cutoffs (seat, seat_head, public_head) VALUES (?, ?, ?)
40 INSERT OR IGNORE INTO outbox (id, data) VALUES (?, ?)
41 UPDATE outbox SET delivered = 1 WHERE id = ?
42 SELECT s.seq, e.data FROM history_streams s JOIN events e ON e.id = s.event_id WHERE s.stream = ? AND s.seq > ? AND s.seq <= ? ORDER BY s.seq LIMIT ?
43 UPDATE outbox SET delivered = 1 WHERE delivered = 0
44 SELECT id, data FROM events WHERE id > ? AND id <= ? ORDER BY id LIMIT ?
45 SELECT data FROM replay_frames WHERE id <= ? ORDER BY id DESC LIMIT 1
```

### Per-operation counters (JSON Lines)

```text
{"name":"cold-restarted-private-current","cloneCalls":1,"cursors":[[0,0,0,0,0,1],[1,0,0,0,0,2],[2,0,0,0,0,1],[3,0,0,0,0,1],[4,0,0,0,0,1],[5,0,0,0,0,1],[6,0,0,6,484,1],[7,0,0,0,0,1],[8,0,0,0,0,1],[9,0,0,0,0,1],[10,0,0,0,0,1],[11,0,0,0,0,1],[12,0,0,0,0,1],[13,0,0,0,0,1],[14,0,0,0,0,1],[15,0,0,0,0,1],[16,0,0,0,0,1],[17,1,1,0,0,1],[18,1,0,1,6863,2],[19,1,0,1,110,2],[19,1,0,1,27,1],[19,1,0,1,955,1],[20,0,0,0,2,1],[21,1,0,1,79,2],[22,1,0,0,2,1],[23,1,0,1,10,1],[19,1,0,1,15,1],[24,1,0,0,2,1],[25,1,1,0,0,1]]}
{"name":"no-op-reconcile-current-arm","cloneCalls":2,"cursors":[[18,1,0,1,6863,4],[19,1,0,1,110,4],[19,1,0,1,27,2],[21,1,0,1,79,3],[23,1,0,1,10,2],[19,1,0,1,15,2],[24,1,0,0,2,2],[25,1,1,0,0,2],[19,1,0,1,955,1],[20,0,0,0,2,1],[22,1,0,0,2,1]]}
{"name":"explicit-alarm","cloneCalls":1,"cursors":[[18,1,0,1,6863,3],[19,1,0,1,110,3],[19,1,0,1,27,1],[19,1,0,1,15,3],[26,1,0,0,2,1],[25,1,1,0,0,2],[23,1,0,1,10,1],[24,1,0,0,2,1]]}
{"name":"socket-resync","cloneCalls":1,"cursors":[[18,1,0,1,6863,2],[19,1,0,1,110,2],[19,1,0,1,27,1],[21,1,0,1,79,1],[23,1,0,1,10,1],[19,1,0,1,15,1],[24,1,0,0,2,1],[25,1,1,0,0,1]]}
{"name":"accepted-action-save-enqueue-broadcast-arm","cloneCalls":18,"cursors":[[18,1,0,1,6863,1],[19,1,0,1,110,6],[19,1,0,1,27,2],[19,1,0,1,955,1],[20,0,0,0,2,1],[27,0,0,0,2,1],[21,1,0,1,80,1],[28,1,2,0,0,3],[21,1,0,1,79,24],[29,0,3,0,0,22],[30,1,1,0,0,23],[31,1,1,0,0,3],[32,1,1,0,0,1],[33,0,0,0,0,3],[34,1,1,0,0,1],[19,1,0,1,15,6],[25,1,1,0,0,6],[35,0,2,0,0,1],[23,1,0,1,10,2],[18,1,0,1,6882,5],[22,1,0,0,2,1],[26,1,0,0,2,1],[24,1,0,0,2,1]]}
{"name":"receipt-retry","cloneCalls":1,"cursors":[[18,1,0,1,6882,3],[19,1,0,1,110,3],[19,1,0,1,27,1],[19,1,0,1,955,1],[20,0,0,0,2,1],[27,1,0,1,262,1],[23,1,0,1,10,1],[19,1,0,1,15,1],[24,1,0,0,2,1],[25,1,1,0,0,1],[21,1,0,1,79,2],[22,1,0,0,2,1]]}
{"name":"timeout-takeover-enqueue","cloneCalls":8,"cursors":[[36,1,0,1,11011,1],[37,1,1,0,0,1],[38,1,1,0,0,1],[18,1,0,1,11013,1],[19,1,0,1,110,6],[19,1,0,1,27,2],[21,1,0,1,79,26],[39,1,1,0,0,1],[21,1,0,1,80,1],[28,1,2,0,0,3],[29,0,3,0,0,22],[30,1,1,0,0,23],[31,1,1,0,0,3],[32,1,1,0,0,1],[33,0,0,0,0,3],[34,1,1,0,0,1],[19,1,0,1,17,3],[25,1,1,0,0,6],[40,0,2,0,0,1],[23,1,0,1,10,2],[18,1,0,1,11038,5],[19,1,0,1,15,3],[26,1,0,1,588,1],[41,1,1,0,0,1],[24,1,0,0,2,1]]}
{"name":"entitled-house-context","cloneCalls":1,"cursors":[[36,1,0,1,11274,1],[18,1,0,1,11276,2],[19,1,0,1,110,2],[19,1,0,1,27,1],[23,1,0,1,10,1],[19,1,0,1,15,1],[24,1,0,0,2,1],[25,1,1,0,0,1],[21,1,0,1,79,2],[42,128,0,64,20979,1]]}
{"name":"terminal-cold-current","cloneCalls":0,"cursors":[[0,0,0,0,0,1],[1,0,0,0,0,2],[2,0,0,0,0,1],[3,0,0,0,0,1],[4,0,0,0,0,1],[5,0,0,0,0,1],[6,0,0,6,484,1],[7,0,0,0,0,1],[8,0,0,0,0,1],[9,0,0,0,0,1],[10,0,0,0,0,1],[11,0,0,0,0,1],[12,0,0,0,0,1],[13,0,0,0,0,1],[14,0,0,0,0,1],[15,0,0,0,0,1],[16,0,0,0,0,1],[17,1,1,0,0,1],[18,1,0,1,11511,5],[19,1,0,1,110,5],[19,1,0,1,27,2],[19,1,0,1,17,3],[19,1,0,1,15,4],[21,1,0,1,80,1],[23,1,0,1,10,2],[25,1,1,0,0,4],[19,0,0,0,2,1],[25,0,2,0,0,1],[43,49,0,0,0,1],[24,49,0,0,2,1]]}
{"name":"terminal-indexed-page","cloneCalls":0,"cursors":[[18,1,0,1,11511,2],[19,1,0,1,110,2],[19,1,0,1,15,3],[21,1,0,1,80,1],[44,64,0,64,267447,1],[23,1,0,1,10,1],[24,49,0,0,2,1],[25,1,1,0,0,1]]}
{"name":"terminal-epoch-reset","cloneCalls":0,"cursors":[[18,1,0,1,11511,2],[19,1,0,1,110,2],[19,1,0,1,15,3],[21,1,0,1,80,1],[23,1,0,1,10,1],[24,49,0,0,2,1],[25,1,1,0,0,1]]}
{"name":"terminal-replay","cloneCalls":0,"cursors":[[18,1,0,1,11511,1],[19,1,0,1,110,1],[21,1,0,1,80,1],[45,1,0,1,11511,1]]}
```
