# Second Agentation review · milestones, portraits and complete rule icons

Five new owner annotations requested a clearer Act I bonus summary, larger left-aligned portraits, an Executor explanation and more dramatic departures with a historical remaining-agent roster. The owner also requested an audit of the remaining icon gaps. **The owner has now accepted this visual pass and requested production implementation.** All five notes are resolved. Action & UI examples are retained as a [dev-only style guide](../../succession-style-guide.md).

## Review

- [C / recorded match](http://localhost:5177/matches/tim-6-replay-prototype?variant=C&sample=match)
- [Named Act I bonuses](http://localhost:5177/matches/tim-6-replay-prototype?variant=C&sample=examples#dp-example-return)
- [Quill’s elimination](http://localhost:5177/matches/tim-6-replay-prototype?variant=C&sample=examples#dp-event-70072bde-05ae-4ee0-ade5-b0498646177b)
- [Execution and return examples](http://localhost:5177/matches/tim-6-replay-prototype?variant=C&sample=examples#dp-example-execution-return)
- [All 36 rule terms and icons](http://localhost:5177/matches/tim-6-replay-prototype?variant=C&sample=examples#dp-rule-index)

## Annotation responses

| Annotation        | Implemented preview                                                                                                                                                                                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mu1wub3s-wxhjtd` | Gold Act I faction-victory summary names **Cipher, Axiom, Katniss Everdeen and Orbit**, with portraits, +1 bonus and integrated **2 → 3 Coins** controls. The chapter summary names them too. The card explicitly says the match continues and all ten return for Act II.                                   |
| `mu1wvedu-ug3nyt` | Chat portraits sit to the left of the bubble, **88px on desktop / 64px on narrow screens**, with the speaker name beneath. Consecutive speech keeps its close spacing and no divider.                                                                                                                       |
| `mu1x18fw-u09wzf` | Action actors use the same larger left portrait column and name underneath, with action text to the right. Small system-phase lines remain compact.                                                                                                                                                         |
| `mu1wwopt-jj5eyi` | **Executor** is an icon-bearing rule term in recorded speech and action prose. Its explanation covers nomination, the two-policy choice and veto. It also distinguishes that office from the Coordinator’s execution power. Coordinator and the other core Act I vocabulary are linked too.                 |
| `mu1x0f4d-ssfqww` | Every recorded Act II elimination gets a deep-red full-row treatment, large named heading, skull, the actual lost card/resource state, and an immediately visible **“still in” count and roster**. Ordinary execution and Overlord execution use the same visual emphasis in labeled illustrative examples. |

## Completed icon audit

All **36 supported terms** have intentional icons, with no generic question-mark fallback. The icon map is exhaustive at compile time. Existing gaps filled: **Veto, Election tracker, Investigation, Special election and Round cap**. Override now has a shield-alert mark, distinct from execution’s skull.

Added explanations and icons for **Coordinator, Executor, Overlord, Cooperative, Rogue, Government, Nomination, Election, Policy, Chaos, Term limits, Executive power and Elimination**. Common inflections link to the same rule without rewriting the original quote. The examples page exposes the complete vocabulary in one expandable review panel.

Rule text is grounded in `public/rules.md`, `src/client/succession-rules.tsx` and the Succession game engine. In particular, Executor is an elected policy-selection office; execution belongs to the Coordinator.

## Historical correctness

- The gold summary belongs to the actual Act I → II boundary. Recipients come from the recorded Act I bonus allocation. This acknowledges a faction result and starting advantage; it does not award overall match victory or claim individual performance caused the bonus.
- Each of the **nine real elimination rosters** is captured from reconstructed public influence immediately after that loss. Later eliminations do not change earlier rosters. At Quill’s elimination, **Velvet, Patch, Spark and Katniss Everdeen** remain.
- The actual match had **no Act I executions**. The execution gallery now includes an ordinary execution of Vesper (nine remain), followed by execution of Quill as Overlord (eight survive; Act I ends), then both return with all ten agents. An ordinary execution reveals no secret allegiance. These are explicitly illustrative events.
- The double-loss example states its independent scenario’s remaining nine agents after Velvet is eliminated.
- All **416 actual quotes** remain exact and **974 public entries** remain in source order. Recorded private card identities still require the historical archive switch.

## Evidence

**138 passing browser checks** at 1440×1080 and 390×844:

- [58 replay regression checks](browser-inspection.json)
- [27 portrait/rule interaction checks](annotation-inspection.json)
- [53 new milestone, historical roster, portrait-position, rule-icon and direct-link checks](moments-inspection.json)

**59 captures** are in `screenshots/`, separate from both previous owner-review rounds. The capture helper now explicitly uses instant scrolling/reduced motion so milestone screenshots show the intended event. Direct review links now scroll to their target after the lazy preview mounts. TypeScript, scoped lint/formatting and production build pass; the production bundle excludes the prototype.

Selected captures: [Act I reward](screenshots/desktop-act-one-bonus.png), [Quill eliminated](screenshots/desktop-quill-eliminated.png), [narrow elimination](screenshots/narrow-quill-eliminated.png), [large action portrait](screenshots/desktop-large-action-portrait.png), [all rule icons](screenshots/desktop-complete-rule-icons.png), [ordinary execution](screenshots/desktop-act-one-execution.png).

Reproduce while Vite is serving port 5177:

```sh
TIM6_CAPTURE_DIR=docs/design/TIM-6/annotation-review-2 node scripts/capture-tim-6-dossier.prototype.mjs
TIM6_CAPTURE_DIR=docs/design/TIM-6/annotation-review-2 node scripts/capture-tim-6-annotations.prototype.mjs
node scripts/capture-tim-6-moments.prototype.mjs
```

Coordinator `ses_f5e672c8fffe5k8CXMagKb30BM` owns Linear and production integration. The profile-upload/onboarding requests from the [first annotation review](../annotation-review/README.md) still apply. The rendering and captured-data adapter remain prototype-scoped.
