# TIM-6 accepted Dossier integration

The owner accepted **C / Dossier visual head `d4f66e9`** and authorized production
implementation. Final approval and queue documentation through **`5aefd54`** is
integrated, including the explicit requirement to retain Action & UI examples as
a development-only style guide.

The [maintained reference](../design/succession-style-guide.md) contains the local
entry point and retention contract. [TIM-31](https://linear.app/tims-stuff/issue/TIM-31)
tracks adoption of actual production components into the guide as TIM-19–23 and
TIM-29 land. The retained baseline currently uses its original fixture rendering.
Production history implementation remains in TIM-18/TIM-23.

## Merge decisions

- Kept the TIM-13 extracted frontend modules and TIM-10 Query provider/lifecycles.
  The development route is selected in `App` before the production `MatchRoute`.
- Moved the prototype's optional bootstrap suppression into the existing
  `use-load.ts` module. Normal routes keep loading; entering/leaving the guide
  disables/enables bootstrap through the existing effect cleanup.
- Preserved root Agentation's shared HTTP listener configuration and the
  prototype's independently retained MCP-only worktree configuration. The main
  application and guide each show exactly one toolbar on their respective routes.
- Package/lockfile dependencies are identical to the pre-merge integration head.
  The only package change is the documented `prototype:replay` script.
- Kept all source fixtures, real/illustrative scenarios, review documents and
  original capture evidence. Capture helpers now accept `TIM6_ORIGIN` and
  `TIM6_CAPTURE_DIR` so integration checks do not overwrite approved evidence.

## Independent verification

The merged application passes all **138 existing browser checks**:

| Suite                                                  | Passing checks |
| ------------------------------------------------------ | -------------: |
| Recorded replay fidelity                               |             58 |
| Portrait/rule interactions                             |             27 |
| Milestones, historical rosters, icons and direct links |             53 |

Four additional integration checks verify:

1. Emitted production assets exclude guide/prototype selectors, captured match
   identifiers, example payload markers and Agentation code/endpoint.
2. The development guide renders all 20 scenarios with one annotation toolbar and
   zero backend requests.
3. Navigating from the guide to normal application routes resumes bootstrap and
   retains a single toolbar.
4. A direct production request for the guide URL reaches ordinary missing-match
   handling, with no guide or annotation toolbar.

Typecheck, lint, build, scoped formatting, whitespace checks and **37 existing
client transport/replay unit cases** pass. Two initial lead-probe errors were
corrected in the external verification harness: Playwright's CJS import and a
selector shared by the toolbar's canvas/marker layers. The application required
no change for either probe error. An initial loading-fallback type error during
merge resolution was corrected before final verification.

## Evidence and reproduction

Lead evidence is hash-verified at:
`/home/timothykrell/Code/agent-games-archive/TIM-6-integration-2026-09-14/`.
Its `lead-evidence.tar.gz` and `manifest.json` preserve **73 entries**, including
59 captures, source inspection results, all lead logs and the integration runner.

Archive SHA-256:

```text
7ba18355d772cd9afd3522d68a73b9c6653903e59c23f994c8f6ef0674b19cbd
```

Run the documented development server, then use a fresh evidence directory:

```sh
TIM6_ORIGIN=http://127.0.0.1:5177 TIM6_CAPTURE_DIR=/tmp/opencode/tim6-review node scripts/capture-tim-6-dossier.prototype.mjs
TIM6_ORIGIN=http://127.0.0.1:5177 TIM6_CAPTURE_DIR=/tmp/opencode/tim6-review node scripts/capture-tim-6-annotations.prototype.mjs
TIM6_ORIGIN=http://127.0.0.1:5177 TIM6_CAPTURE_DIR=/tmp/opencode/tim6-review node scripts/capture-tim-6-moments.prototype.mjs
```

The archived lead runner additionally starts isolated development/production
servers and exercises the route/build boundary. Original design captures remain
under `docs/design/TIM-6/`; the retained owner-review worktree still supplies its
existing port-5177 entry point.
