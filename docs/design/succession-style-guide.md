# Succession UI style guide · retained development reference

The owner approved the refined **C / Dossier** design for production implementation after both Agentation review passes. They explicitly asked to retain **Action & UI examples** in the code as a reusable style guide, available during development only.

The coordinator queued the maintained shared-component guide as **[TIM-31](https://linear.app/tims-stuff/issue/TIM-31)**. The accepted design issue, **[TIM-6](https://linear.app/tims-stuff/issue/TIM-6)**, is complete.

## Open it

```sh
npm run prototype:replay
```

- [Action & UI examples](http://localhost:5177/matches/tim-6-replay-prototype?variant=C&sample=examples)
- [All rule terms and icons](http://localhost:5177/matches/tim-6-replay-prototype?variant=C&sample=examples#dp-rule-index)
- [Full recorded-match reference](http://localhost:5177/matches/tim-6-replay-prototype?variant=C&sample=match)

The command starts Vite on port **5177**. The captured fixture works without a game backend or sign-in. The optional Agentation toolbar uses the shared annotation server on port 4747; [setup details](TIM-6/owner-review/AGENTATION.md).

## Keep available through implementation

- Retain the **20 scenario groups**, **36 rule terms/icons**, captured-match examples and clearly labeled illustrative cases. These show dialogue, actors/portraits, resource changes, card loss, proof, blocks, Exchange, elections, faction rewards, execution/return, elimination rosters, round caps, takeover and interruption.
- Keep desktop/narrow layouts, the private-archive toggle, contextual rule help, portrait enlargement and direct section links usable for future style review.
- As the coordinator integrates the production Dossier, render the guide with those shared UI components and local fixtures so future styling changes are visible here. The captured-data adapter is a fixture adapter; production history must use its real data contracts and bounded retrieval.
- Preserve the current guide until its shared-component successor is available. The existing `*.prototype.*` names reflect its origin and are not a deletion instruction.
- Maintain a documented development entry point. The URL may be renamed during integration if the README and reference links are updated together.

## Development boundary

Both the lazy import and route predicate in `src/client/main.tsx` are guarded by **`import.meta.env.DEV`**. Keep that build-time exclusion. The guide must not become a production route, be enabled by a production query flag, or ship its captured fixture/illustrative data or Agentation code in production assets.

The current `npx vite build` output has been checked: it contains none of the Dossier prototype selectors, captured match ID, example labels or Agentation endpoint. Recheck the production build when moving or rewiring the guide during integration.

## Sources and accepted design

- UI: `src/client/succession-dossier.prototype.tsx` and `.css`
- Rules: `src/client/succession-dossier-rules.prototype.tsx`
- Portrait illustrations: `src/client/succession-dossier-profiles.prototype.tsx`
- Scenarios/adapter: `src/client/succession-dossier-data.prototype.ts`
- Recorded archive: `src/client/succession-replay-record.prototype.json`
- Dev wrapper: `src/client/succession-replay.prototype.tsx`
- [Approved design and coordinator handoff](TIM-6/owner-review/HANDOFF.md)
- [Latest design evidence](TIM-6/annotation-review-2/README.md): **138 passing browser checks**, **59 captures**

Production implementation and the requested profile-picture upload/onboarding functionality are handed to the coordinator. This page records the retained development reference and its approved visual contract.
