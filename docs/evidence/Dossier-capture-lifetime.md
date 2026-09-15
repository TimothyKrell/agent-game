# Native history response-capture lifetime correction

## Result

The affected actual Worker exhibition passed on **6461/6861**: **1 passed, 0 failed, 0 skipped, 0 flaky**, 36.2 seconds including the fresh Worker startup. Two focused native-HTTP regression cases also pass. The earlier 153-case report and all earlier artifacts remain intact.

Source: accepted `6c76193`, consumed as local merge `d0f6615`, plus the test/helper correction. The parent-owned `d1777bd` selector correction is independent; this change does not edit `e2e/succession.spec.ts` or production code.

## Diagnosis

Parent evidence: `/tmp/opencode/Dossier-lead-browser/report.json` and `artifacts/succession-worker*/trace.zip`, produced on the parent's `988580d` checkout. The failed response was a native/CDP body read at `e2e/succession-worker.spec.ts:40`, ultimately reported by the unchanged `captureErrors` assertion at line 137.

The trace distinguishes an instrumentation lifetime failure from a rejected endpoint:

| Native operation           | Start (trace ms) |
| -------------------------- | ---------------: |
| Test-directed reload       |       221638.786 |
| Another response body read |       221639.730 |
| Failing response body read |       221646.126 |

The last operation failed at 221698.503 with `Network.getResponseBody: No resource with given identifier found`; Playwright explicitly reported that the response had been navigated away from.

Ranked hypotheses were late task admission at `requestfinished`, the intervening bounds read between the array drain and reload, and cancellation misclassification. The first two formed the confirmed race: `Promise.all(reads)` takes a fixed snapshot and does not wait for requests still in flight or callbacks appended later. The bounds measurement then allowed further work before `page.reload()`.

The minimized red control extracted that existing collector into the helper seam. A real HTTP response's consumer was held while a second real request arrived after draining began. The legacy drain started reload before the second response was captured: only `{"events":[1]}` was measured, `reloadedBeforeSecond` was true, and the regression assertion failed. This required no Worker fixture, mocked Playwright response, retries, or timing sleeps.

## Correction

`e2e/fixtures/history-response-capture.ts` now:

1. Registers the full capture task synchronously at native **request start**. It awaits `request.response()` and starts consuming the body as soon as headers make the response available.
2. Keeps each task pending through both body consumption and the native `requestfinished`/`requestfailed` terminal event.
3. Drains a live pending map until empty, including requests admitted while earlier bodies are being consumed.
4. Performs the final drain and invocation of test-directed navigation within one helper operation. The Worker bounds measurement occurs **before** this operation.
5. Suppresses a body failure only when the same request has an actual native `net::ERR_ABORTED` failure. Other transport failures and all completed-response processing errors remain capture errors.
6. Records declared collection generations and each request's final outcome. These generations mark the test-owned reload boundary, not browser loader IDs. They do not classify or excuse lost responses.

The original `captureErrors === []`, cancellation reasons, schema validation, byte/event limits, checkpoint, private archive and reader-bound assertions remain. Additional assertions require no pending entries, one recorded measurement per captured request, and successful measurements in both generations. There is no lifecycle-loss pass category and no message-based exception for `Network.getResponseBody` errors.

## Verification and retained artifacts

All outputs are beneath `.dossier-e2e/results/` with distinct names:

| Run                                 | Result             | Meaning                                                                                                                                                                       |
| ----------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capture-lifetime-red-1`            | 1 failed           | Original snapshot-based collector navigated before the later request was captured.                                                                                            |
| `capture-lifetime-green-1`          | 1 passed           | Request-start registration plus dynamic drain captures both real HTTP responses before reload.                                                                                |
| `capture-lifetime-classification-1` | 1 passed, 1 failed | Diagnostic negative-control assumption was incorrect: this Chromium retained a completed response body across reload. This was not an app failure.                            |
| `capture-lifetime-classification-2` | 2 passed           | Retains the navigation regression and proves genuine native abort is separate from a completed response's body-consumer error, using deliberately malformed native HTTP JSON. |
| `capture-lifetime-worker-1`         | 1 passed           | Original two-act exhibition, actual current/history/checkpoint endpoints, disclosure and bounds checks.                                                                       |

The classification control permits the native JSON-decode or native CDP failure that the completed response's consumer actually reports; it requires exactly one retained error and a separate `ERR_ABORTED` outcome. It does not require Chromium to evict a particular cached response.

### Actual Worker result

- Match: `match_b14c584d-60eb-4230-9321-6f10d7704002`; finished archive head **2439**.
- Exact checkpoint **2311**, **4630 bytes**, historical baseline still active while current is finished.
- Generation 0: **208 admitted**, **207 captured**, **1 genuine ERR_ABORTED**. Reload boundary: **0 pending**.
- Generation 1: **8 admitted and captured**, **0 canceled**.
- **215 completed native history responses**; maximum **32 events / 16,345 bytes**. Capture errors: **0**.
- Maximum **128 rendered rows** per reader, no duplicate or out-of-order cursors.
- All original privacy and historical checkpoint assertions passed.

The final native lifecycle manifest, history measurements, current/checkpoint snapshots and reader bounds are extracted in `capture-lifetime-worker-1/evidence/`. `worker-capture-lifecycle.json` is also a test attachment in `report.json`; the native trace and screenshots are under `artifacts/`.

Report SHA-256 values:

- Actual Worker: `bef07f0933bf20a80628c51438c47dac2df842bfb3c6cabf9944fa455821e7be`.
- Minimal red: `5e6546452a67c282b175a59c5ab129d2e1e0f00a0c5b4c463a7267d6a28a7322`.
- Two-case native green: `9106629e5db42ae9f800fad3da4e33b497bdd36df0c3d132f2b602bf23d6c972`.
- Unmodified earlier 153-pass report (`full-5/report.json`): `1e27ad91f177668fffac4d4c62d8c003e5ece50bfb90acd16c9b7a65f8fd1d01`.

TypeScript, scoped Oxlint and formatting checks passed; their logs are `capture-lifetime-{typecheck,lint,format}-final.txt`. The owned ports were released after verification (`capture-lifetime-ports.txt`).

## Commands

The native regression config starts its own small HTTP server on 6461. In Worker mode it instead uses the established `node scripts/dev.mjs --test`, `PORT=6461` (inspector 6861), preview/scripted provider, time scale 0.02, no existing-server reuse, one `/usr/bin/chromium` worker, and the normal installed recorder. No package installation or HOME change is needed.

```bash
DOSSIER_RUN=capture-lifetime-classification-2 node node_modules/@playwright/test/cli.js test --config .dossier-e2e/capture-lifetime.config.ts
DOSSIER_RUN=capture-lifetime-worker-1 CAPTURE_WORKER=1 PLAYWRIGHT_BROWSERS_PATH=/home/timothykrell/.cache/ms-playwright node node_modules/@playwright/test/cli.js test --config .dossier-e2e/capture-lifetime.config.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/oxlint/bin/oxlint e2e/fixtures/history-response-capture.ts e2e/succession-worker.spec.ts .dossier-e2e/capture-lifetime.config.ts .dossier-e2e/capture-lifetime.spec.ts
node node_modules/prettier/bin/prettier.cjs --check e2e/fixtures/history-response-capture.ts e2e/succession-worker.spec.ts .dossier-e2e/capture-lifetime.config.ts .dossier-e2e/capture-lifetime.spec.ts docs/evidence/Dossier-capture-lifetime.md
```

Use a fresh `DOSSIER_RUN` value when reproducing; the listed runs are retained evidence. The actual Worker run was backgrounded and its completion notification awaited. The unaffected full suite was not rerun.
