# Dossier review · Terminal entry and Final move

Follow-up: [pending ending-navigation ownership](../TIM-19-22-ending-intent/README.md) addresses the new async lifetime P2 found in independent review of `ab8706c`. The original terminal-entry evidence below is preserved.

This follow-up completes the new presentation review finding against `4f7901b`. It follows:

- `54a3abd`: shared RuleHelp closing-trigger focus correction, [red/green diagnosis and original nine regressions](../TIM-11-dossier-focus/README.md).
- `a59fbbc`: [canonical starting-state and action-vocabulary corrections](../TIM-19-22-standards-corrections.md).
- Separate dependency merges `d43afdb` / `55e8069`: accepted TIM-23 changes through **`0fb03f8`**, including `74592b8` terminal Tax and the final precommit scroll-ownership correction. This follow-up does not edit the reader, timeline or authorized data modules.

## Red: completed route starts at source 3

`route-red/1440-terminal-entry.json` retains the actual route's request trace: checkpoint **2**, history **3–130**, authoritative head **1306**, and no Final move action. The new assertion fails before any archive traversal. This is normal application route composition with the canonical-engine backend fixture, not a standalone presentation fixture.

## Correction and source contract

- A completed route's fixed entry act is Act II, initialized with the existing bounded reader's `initial: 'latest'`. Active and interrupted routes enter their current act at its latest authorized record. Explicit chapter choices and mounted reader instances survive status changes.
- The actual route keeps both chapter hooks mounted and enables them independently. Only the authoritative live act receives live-follow behavior. Completed entry shows the compact outcome, Act I closed, Act II open, and the bounded terminal window.
- The outcome accepts a pure presentation `ending: { label, onRead? }` slot. The route discovers and retains one authorized source anchor from its terminal window. It retains no extra history rows.
- `dossierEnding` requires an actual public canonical `finished` row. For a last-survivor ending it uses that row's recorded action/declaration source. At the cap, the canonical model clears active action on `turn-ended`, so the selector accepts the immediately preceding completed turn only across a contiguous terminal-phase/audit tail. An intervening activity or missing event breaks that connection. It never picks an arbitrary last declaration, private event or audit.
- When the final declaration source is unavailable, the label is **Terminal record** and the target is the real `finished` event. Before a terminal source is loaded, that control is disabled; historical loading/retry remains visible in the reader.
- Activation reopens the needed chapter, uses the existing stable-key `seek` API to load a bounded window, then scrolls and focuses the actual source article once it is rendered. That focus is tied to an explicit navigation request; there is no timeout, sentinel, per-render focus or independent history loader.

For the canonical route fixture, the terminal-first request is checkpoint **1178**, history **1179–1306**. Final move targets the actual Income declaration **1301** (`story-226372697-1604`), supported by completed turn **1303** and result **1305**. The trailing audit **1306** is never labelled as a move. Production performs four 32-event/16KB-limited history requests for this initial window and no archive-prefix reads.

## Verification

| Check                                                          | Result                                                                              |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Actual route, development                                      | **87 assertions pass**, zero failures                                               |
| Actual route, production                                       | **90 assertions pass**, zero failures                                               |
| Presentation/model/reader/loading/picture unit suites          | **73 tests pass**                                                                   |
| Production-component guide                                     | **212 assertions pass**, 1440 / 390 / 320                                           |
| Preserved original guide                                       | **138 assertions pass**, all 59 captures retained in a separate follow-up directory |
| Original accepted RuleHelp regression                          | **9 pass**, plus **4 focused** regressions in the focus-fix evidence                |
| Typecheck, lint, scoped formatting, build, diff check          | Pass                                                                                |
| Production import graph and direct development-entry exclusion | Pass                                                                                |

Route checks exercise both `/matches/:id` and `/matches/:id/history`, completed first entry without prefix fetching, Final move from older and closed windows at all three widths, focus returned from pinned rule help after whole-chapter collapse at all three widths, active/controller/Act I/interrupted defaults, authoritative command IDs, terminal epoch handling, exact chapter acts, and portrait recovery. The final selector's unit coverage also rejects missing causal evidence and gapped terminal tails.

The original traversal assertions remain substantive: terminal entry first reverses all the way to the Act II start, then traverses forward through eviction over **512 distinct visible records**, reaches **1306**, and reverses again with settled visible rows. Maximum visible records remain **128 per reader**; measured retained-row forward drift is **0.421875px**. Archive-card assertions explicitly visit the historical start because the final Income window contains no private cards. The window-retention assertion activates the chapter heading without first scrolling to it, since scrolling upward from a terminal window legitimately initiates earlier retrieval.

All **20 scenario groups**, **36 rule terms**, **974 captured public entries**, **416 exact quotes**, and nine historical elimination counts remain in the retained component/source fixtures. Original `TIM-19-22-components` evidence is not overwritten.

## Reproduction

```sh
DOSSIER_PORT=6191 node .dossier/serve.mjs
DOSSIER_ORIGIN=http://127.0.0.1:6191 DOSSIER_EVIDENCE_DIR=docs/evidence/TIM-19-22-terminal-entry/route-green node .dossier/route.mjs
DOSSIER_ORIGIN=http://127.0.0.1:6191 DOSSIER_EVIDENCE_DIR=docs/evidence/TIM-19-22-terminal-entry/components node .dossier/verify.mjs
TIM6_ORIGIN=http://127.0.0.1:6191 TIM6_CAPTURE_DIR=docs/evidence/TIM-19-22-terminal-entry/original-guide node .tim11/verify-guide.mjs
npm test -- tests/dossier-components.test.ts tests/succession-story.test.ts tests/continuous-succession-history.test.ts tests/succession-history-loading.test.ts tests/agent-picture-data.test.ts
npm run typecheck
npm run lint
npm run build
DOSSIER_PRODUCTION_EVIDENCE_DIR=docs/evidence/TIM-19-22-terminal-entry/production DOSSIER_EVIDENCE_DIR=docs/evidence/TIM-19-22-terminal-entry/production/route node .dossier/production.mjs
```

The production runner starts and stops its own preview on **6292**. The owned development server on **6191** is stopped at handoff. No parent ports or services are used.

## Acceptance boundary

The three retained chapter-focus failures are closed in both development and production. The assigned presentation P2 and two duplication P3 findings are corrected; accepted history-owner corrections are consumed. Lane checks pass. **Final independent parent review/integration acceptance remains pending.** API/WebSocket responses are intercepted canonical engine fixtures, not deployed authorization tests. Parent retains its newer TIM-29 data corrections (`dfb44e6`); this follow-up changes no picture-data APIs or implementation.
