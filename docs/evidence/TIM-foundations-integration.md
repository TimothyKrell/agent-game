# Dossier foundations — parent integration checks

## Combined checkpoint

Local integration `7233eb6` combines:

- TIM-11: dependency checkpoint `d5d0630`, cascade `41ee205`, primitives and retained-guide adoption `f61b0c3`.
- TIM-18: canonical bounded story model `6c8dc3c`.
- TIM-28: optional stable-identity pictures `6434591`.

All three source worktrees and their original evidence are retained. The combined checkout passed all three TypeScript projects, repository lint (zero warnings/errors), production build and `git diff --check`. Existing locked dependency versions did not change.

## Independent parent checks

```sh
npx vitest run tests/succession-story.test.ts tests/agent-pictures.test.ts tests/platform-repository.test.ts tests/rating-storage.test.ts tests/client-api.test.ts tests/worker-errors.test.ts tests/succession-codecs.test.ts
```

**65 tests passed**, including all 24 canonical story cases, eight actual Worker/D1/R2 image cases and 33 existing regression cases. The image transaction-failure injection logged its expected local D1 error; existing local workerd RPC diagnostics did not fail the assertions.

The parent browser runner is `/tmp/opencode/verify-foundations-integration.mjs`. It copies probes to independent output directories, redirects captures and preserves the original source evidence:

- **138/138 guide checks passed**, producing 59 captures in `/tmp/opencode/TIM-foundations-lead/guide/`.
- The real owner-picture browser flow passed against the combined built Worker, including upload, lost-response retry, replacement, invalid replacement and retired-owner removal.
- Production output and direct-route checks passed: all five populated CSS layers in order, one hoisted font import, prefixed utilities, no Preflight, and no guide/scenario/captured/private/Agentation payload or mounted fixture route.
- Four of five primitive journeys passed on first run. The remaining desktop journey passed its interaction assertions but caught a React startup error in its page-error assertion; its correction is still under investigation below.

Parent logs and captures:

- `/tmp/opencode/TIM-foundations-lead-tests.log`
- `/tmp/opencode/TIM-foundations-lead-browser.log`
- `/tmp/opencode/TIM-foundations-lead-browser-final.log`
- `/tmp/opencode/TIM-foundations-lead-delivery.log`
- `/tmp/opencode/TIM-foundations-lead-delivery/`

No hosted deployment, account provisioning or paid inference is claimed.

## Review findings — open at this checkpoint

Reviews use the fixed three-dot diffs `d5d0630...f61b0c3`, `2d849c2...6c8dc3c` and `d5d0630...6434591`.

| Slice  | Standards                                                                   | Spec / correctness                                                                              |
| ------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| TIM-11 | 0 findings                                                                  | Two P2: delayed hover-to-click promotion; orphan help when a disclosure removes its trigger     |
| TIM-18 | 0 findings                                                                  | One P2: trailing private reaction/hand records lose completed-action context                    |
| TIM-28 | One P2: duplicate binary response decoding loses non-JSON HTTP error status | One P2: a confirmed old receipt is presented as current before metadata reconciliation succeeds |

Standards reviewer: `ses_f5d4dec81ffeXEzjoeuzxeeQ9Y`. Spec reviewer: `ses_f5d4d9d7dffeX4Oq1DsirTXYK4`. Findings were sent to the implementation owners for focused corrections and regression evidence. These are not yet closed by the passing baseline checks above.

The separate parent cold-start failure is `Cannot read properties of null (reading 'useRef')` during the first 1440px primitive journey. It reproduced twice, including with an independent new Vite cache, alongside late `@base-ui/react/collapsible` optimization and reload. Warm and smaller direct-entry probes passed. Root cause remains unconfirmed; the original page-error assertion is retained. Source application changes are not justified by a warm retry alone.

## Next slices started

TIM-23 owns exact authorized historical start checkpoints, continuous bounded loading and scroll anchors. TIM-19–22 share one presentation owner for cards, status, rules and chapters, with incremental typed-fixture adoption in the retained TIM-31 guide. TIM-30 owns optional CLI/onboarding picture setup. TIM-27 continues source/target identity handoffs; shared CLI and infrastructure integration remains serialized by the parent.
