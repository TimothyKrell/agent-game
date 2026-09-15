# TIM-23 review correction · Query pause state

Baseline: `bba70f8`. Original `.tim23` reports are preserved. This directory holds the independent P2 correction's reproduction and verification; browser output uses a unique `TIM23_EVIDENCE_DIR` subdirectory.

The first regression uses the installed Query `onlineManager` with a mounted QueryClient, starts the actual continuous reader offline, and distinguishes Query's paused fetch state from the reader's incorrect loading state. The parent already confirmed this Query behavior; the focused reproduction replaces a broader speculative diagnosis.

## Correction

`ContinuousStorySnapshot.status` adds **`paused`**. The reader subscribes to its operation's exact Query instance, reads its initial fetch status, and projects only pause/fetch transitions while the reader ticket and enabled lifetime remain current. The subscription is removed when the fetch settles or is cancelled. No global UI state or offline network-policy bypass is introduced.

The timeline uses **“Offline. Waiting for connection to load the record.”** and `aria-busy=false`. Delivered model/rows, head, anchors and timestamps are not advanced by paused work. Existing current/command mutation ownership is unchanged.

Reproduction: `red.txt` shows actual Query paused while the old snapshot says loading. `reader.json`/`reader.txt` cover the focused reader suite including initial pause, pause between an in-flight anchor lookup and its story read, reconnect once, same-cache independent readers, hidden/disposed cancellation and quiet-table delivery. `browser-1/` and `browser-1.txt` cover the mounted hook's waiting copy, non-busy ARIA, retained rows, disclosure cancellation and unmounted paused-reader cancellation using the real Query online manager.

The Playwright config now accepts `TIM23_EVIDENCE_DIR` and otherwise chooses a timestamp/process-specific directory. Original reports stay intact across future verification runs.

Verification: **12 reader tests** and **31 browser tests** (8 continuous-reader scenarios plus the existing 23 replay/Query/current/command lifecycle scenarios) passed. All three TypeScript projects, whole-repository lint, CLI/Vite build and scoped formatting passed. `browser-full/` is the final browser report. Report-only trailing whitespace is normalized for commit checks; original pre-review artifacts are unchanged.
