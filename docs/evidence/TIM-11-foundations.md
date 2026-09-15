# TIM-11 · replay styling and interaction foundations

## Cascade checkpoint

Baseline: `d5d0630`, exclusive `feat/tim-11-replay-foundations` worktree. Exact parent-installed Tailwind / Vite plugin **4.3.3** and Base UI **1.8.0**; no manifest/lockfile edits.

`src/client/client.css` is the single application CSS entry. Its explicit order is `theme, legacy, base, components, utilities`. All six previous sheets remain in one `legacy` layer, in original order. The external Luminous font request is hoisted from `luminous.css` to the top of the manifest: a nested import would be invalid. No Preflight or shadcn reset. Utility prefix is `tw:`; source discovery is opt-in.

Before adding primitives:

- Original guide baseline: **138/138** browser checks, 59 captures in `TIM-11-foundations/before/`.
- Cascade guide check: **58/58**, 31 captures in `TIM-11-foundations/cascade/`.
- Existing public-compositions test before and after: passed across **1600, 1024, 768, 760, 390, 320**; home, leaderboard, profile, owner, rules, connect, dashboard.
- Focus / reduced-motion / computed-style and screenshots: `.tim11/cascade.mjs before` and `cascade` at **1440×1080 / 390×844**. Explicit prefixed background utility beats `.button.primary`; unaffected typography, border, padding, clipping and motion metrics identical.
- `.tim11/compare.mjs` compares decoded screenshots; only the asynchronous Agentation toolbar corner may differ. Original design capture evidence is untouched.
- `npx vite build` passes. Compiled CSS begins with exactly one external font import. Empty layer declarations are optimized; the populated legacy/utility ordering is preserved. Final populated component layers are checked again below.

Commands run against this worktree's Vite on **6191** (no backend, shared annotation server untouched):

```sh
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 6191 --strictPort
TIM6_ORIGIN=http://127.0.0.1:6191 TIM6_CAPTURE_DIR=docs/evidence/TIM-11-foundations/before node scripts/capture-tim-6-dossier.prototype.mjs
TIM6_ORIGIN=http://127.0.0.1:6191 TIM6_CAPTURE_DIR=docs/evidence/TIM-11-foundations/before node scripts/capture-tim-6-annotations.prototype.mjs
TIM6_ORIGIN=http://127.0.0.1:6191 TIM6_CAPTURE_DIR=docs/evidence/TIM-11-foundations/before node scripts/capture-tim-6-moments.prototype.mjs
TIM11_STAGE=before node node_modules/@playwright/test/cli.js test --config .tim11/playwright.config.ts e2e/sitewide.spec.ts --grep 'all public compositions'
node .tim11/cascade.mjs before
# Repeat cascade.mjs, dossier capture and public-compositions with stage/directory cascade.
node .tim11/compare.mjs
```

## Production API for TIM-19–23 / TIM-29

Use relative imports from `src/client/ui/`. Put the reading surface inside **`.replay-ui`**. Dialog and popover content automatically mount a **`.replay-ui-portal`** under the document body, with the same semantic tokens. These classes do not reset the whole application.

| Module            | Exports / contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `button.tsx`      | `Button`, `ButtonProps`. Native button props and React 19 ref; `type="button"` default; `variant="primary" \| "secondary" \| "quiet"`; `size="default" \| "small"`. Real disabled and submit behavior. Use an ordinary link for navigation.                                                                                                                                                                                                                                                                                                    |
| `collapsible.tsx` | `Collapsible`, `CollapsibleProps`, `CollapsibleTrigger`, `CollapsibleContent`. Required owner-controlled `open` and `onOpenChange`; Base UI Trigger/Panel semantics. Compose a chapter heading around `CollapsibleTrigger render={<Button />}`. No height animation or clipping of descendants.                                                                                                                                                                                                                                                |
| `dialog.tsx`      | `Dialog`, `DialogTrigger`, `DialogContent`, `DialogContentProps`, `DialogClose`, `DialogTitle`, `DialogDescription`, `createDialogHandle`. Root supports Base UI controlled/uncontrolled state and typed detached triggers. Content always includes a labeled close button; `closeLabel`, `initialFocus`, `finalFocus`, normal popup props and `className` are available. Default initial focus is the close control; default return focus is Base UI's initiating trigger. Supply a return ref for programmatic openings without a trigger.   |
| `popover.tsx`     | `Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverContentProps`, `PopoverClose`, `PopoverTitle`, `PopoverDescription`, `createPopoverHandle`. Positioner supports `side`, `sideOffset`, `align`, `alignOffset`; viewport collision padding is 12px. Optional `backdrop` is used for pinned rule help. Root retains Base UI modal/controlled behavior.                                                                                                                                                                                     |
| `rule-help.tsx`   | `RuleHelpProvider`, `RuleHelpTrigger`, `RuleHelp`. One shared Base UI handle per reading surface. Payload is `{title, summary, description, icon}`; copy is supplied by the domain consumer. Trigger accepts native button props/ref/children. Mouse hover previews, click/Enter/Space/tap pins; Escape/outside press/close dismiss. Pinned help contains focus and returns it to its trigger. Hover survives moving onto the popup and scrolling within it, and dismisses when its reading surface scrolls. A hidden document dismisses help. |

Always provide visible term text and an accessible name on icon-only triggers. Mark decorative icons `aria-hidden`. A rule-help preview uses tooltip semantics; the same Base UI Popover becomes a focus-contained dialog when pinned. There is no second tooltip dependency or manually maintained focus trap.

For portrait enlargement, `DialogContent className="replay-portrait-dialog"` provides the accepted square Luminous frame and responsive image/title/caption treatment; the identity owner supplies the image, alt text, title and description.

The guide now consumes the **actual production RuleHelp and Dialog modules**, including the production close `Button`. All 20 groups, all 36 terms/icons, private archive toggle, portrait illustrations/fallback, descriptions, source fixture adapter and examples remain. The source vocabulary/data files remain development-only. Chapter composition is demonstrated by `.tim11/foundations.html`; production chapter/history ownership stays with the downstream story consumers.

## Semantic token contract

`ui/tokens.css` owns these names, scoped identically to the in-page root and portal root:

| Roles               | Tokens / values                                                                                                                                                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces and text   | `--replay-background` → legacy `--bg`; `--replay-surface` → `--surface`; `--replay-foreground` → `#e8f1ed`; `--replay-muted-foreground` → `--muted` (text).                                                                                                                                     |
| Borders and focus   | `--replay-border` → `--line`; `--replay-border-strong` → `#65857b`; `--replay-ring` / `--replay-accent` → `--green`; `--replay-accent-foreground` → `--bg`.                                                                                                                                     |
| Game meanings       | `--replay-cooperative` → `--teal`; `--replay-rogue` → `--red`; `--replay-neutral` → `--brass`; `--replay-private` → `--violet`; `--replay-destructive` → `--danger`. Faction and destructive roles are separate.                                                                                |
| Approved milestones | `--replay-departure`, `--replay-departure-background`, `--replay-departure-border`, `--replay-departure-fill`; corresponding `--replay-bonus*` roles. Values/gradients are copied from the accepted red departure and gold Act I summary. No inferred match outcome is encoded by these tokens. |
| Contextual rules    | `--replay-help-background`, `--replay-help-foreground`, `--replay-help-border` preserve the accepted green reference panel.                                                                                                                                                                     |
| Fonts               | `--replay-font-body`: Montserrat; `--replay-font-display`: Poiret One. Existing font request/weights remain.                                                                                                                                                                                    |
| Spacing / identity  | `--replay-space-1/2/3/4/6`: 4/8/12/16/24px; `--replay-portrait-size`: 88px, 64px at ≤760px.                                                                                                                                                                                                     |
| Decoration / motion | `--replay-step` references the existing polygon; `--replay-frame` uses `/deco-frame.svg`; `--replay-motion-fast`: 120ms (0ms reduced/hidden); `--replay-motion-ease`: ease-out; `--replay-overlay-z`: 100.                                                                                      |

Shared surface/text/faction/milestone color roles and body/display fonts have inline Tailwind mappings, e.g. `tw:bg-replay-surface`, `tw:text-replay-muted-foreground`, `tw:font-replay-display`. Contextual-help styling, gradient fills and stepped decoration use ordinary CSS variables. Add each newly migrated consumer path deliberately to `client.css`'s source list. Currently only `./ui` and the single transparent-background cascade fixture are discovered; no application-wide scan. The real rule heading uses `tw:shrink-0`.

The new button clips **only its decorative pseudo-element**. Its outer focusable box and outline are unclipped. Apply stepped decoration to an inner decorative layer when composing cards with focusable descendants too. New primitive CSS explicitly supplies border styles, sizing, inherited fonts and focus; it relies on no Preflight. Existing important reduced-motion/visibility declarations remain earlier in the legacy layer and continue to win under inverted important-layer ordering.

## Provenance

[Source ownership and license](../../src/client/ui/UPSTREAM.md) record the selected first-party **shadcn base-nova** registry sources for Button, Collapsible, Dialog and Popover, retrieved **2026-09-14**. Exact responses and SHA-256 hashes are retained in [`upstream/`](TIM-11-foundations/upstream/). Locked Base UI 1.8.0 source/type inspection verified hover, detached trigger payloads, modality, focus, collision and disclosure APIs. Required dependencies were already installed by the parent; no dependency changes were made here.

The selected shadcn anatomy is retained. Native Button replaces the template's cva/cn/Base Button wrapper with the requested modest native API. Styling is adapted to Luminous; optional template footers/headers, aliases, palette and animation imports are omitted. Dialog and Popover aliases retain their Base UI types rather than duplicating every upstream prop.

## Control / integration verification

Final results and screenshot sets live in `TIM-11-foundations/controls-verified/` and `interactions/`. The original scripts remain intact; `.tim11/verify-guide.mjs` adapts only the native-dialog locator and waits for Base UI's queued focus restoration. It preserves all **138 original assertions**. Initial `controls/` and `controls-final/` records preserve the focus failures encountered during implementation; they are superseded by `controls-verified/`. A genuine closure-order defect was corrected: pinned mode now survives closure so its focused close button is not removed before Base UI restores the originating trigger. The adapter explicitly waits for that exact trigger, not merely for the popup to disappear.

- **Five focused browser journeys:** native type/ref/disabled/form behavior, controlled chapter keyboard disclosure, initial/contained/return focus, nested dialogs, pointer dismissal, portal typography/tokens, long identities at 1440/390/320 widths, hover-to-pin, touch, scrollable long rule text, reduced-motion and simulated hidden-document dismissal.
- **Nine existing sitewide/Succession journeys pass:** seven public compositions across six widths; long identities/installations; error/retry and malformed response/session expiry; actual-engine act transition/privacy; terminal winner during bounded replay; rules navigation; full historical identities at 320/390.
- **Six existing motion journeys pass:** keyboard selection/settled geometry and live reading/replay with normal/reduced motion, preference changes, hidden entrances and authoritative fallback.
- `npm run typecheck` passes (application, infrastructure, Oxlint configurations). `npm run lint` passes with **0 warnings / 0 errors**. `npm run build`, scoped `prettier --check` for every changed source/config/evidence script and this document, and `git diff --check` pass.
- Production asset scan plus direct-route browser checks: [`production.json`](TIM-11-foundations/production.json), [`production-direct-route.png`](TIM-11-foundations/production-direct-route.png). All five populated layers retain the intended order in compiled CSS; exactly one hoisted font import; prefixed utility emitted; no Preflight. Production assets exclude the guide, scenarios, raw captured match, private fixture and Agentation. Direct guide URL reaches the ordinary unavailable-match route; direct fixture URL does not mount the fixture. No port-4747/prototype module requests occur.

```sh
node .tim11/verify-guide.mjs
node node_modules/@playwright/test/cli.js test --config .tim11/interaction.config.ts
TIM11_STAGE=regression node node_modules/@playwright/test/cli.js test --config .tim11/playwright.config.ts e2e/sitewide.spec.ts e2e/succession.spec.ts --grep 'all public compositions|long valid identities|route errors retry|malformed responses|actual engine boards|one terminal champion|rules scope restores|full phase identities'
TIM11_STAGE=motion-regression node node_modules/@playwright/test/cli.js test --config .tim11/playwright.config.ts e2e/motion.spec.ts
npm run typecheck
npm run lint
npm run build
node .tim11/production.mjs
git diff --check
```

## Deliberate choices and verification limits

- The 200% layout-zoom journey uses CDP **320×422 CSS pixels / scale factor 2**, representing a 640×844 physical viewport, and scrolls to the end of the reference. This is browser-layout emulation, not an OS/browser-toolbar zoom certification. Arbitrary CSS `zoom` on the root is unsupported: an exploratory attempt exposed double-scaled floating coordinates; the app does not apply CSS zoom.
- Chromium `/usr/bin/chromium` is the exercised engine. No Safari/Firefox or screen-reader session is claimed. CSS font loading succeeded and the actual font-family/computed-style comparison is preserved.
- Popover placement uses Base UI collision handling; it can flip or shift near viewport edges instead of the prototype's fixed manual clamp. The palette, content, compact rounded rule panel, square portrait frame and focus styling retain the approved art. Overlays/disclosure do not animate; only button color has a short optional transition.
- Production JavaScript remains **487.14 kB / 151.86 kB gzip** at this checkpoint because the first consumers are dev-only. Foundation CSS is **113.85 kB / 23.29 kB gzip** in the total stylesheet. Downstream production imports will legitimately add the selected Base UI runtime.
- This establishes styling/interaction interfaces and advances shared-component guide adoption. It does not supply production event projection, history/query state, timeline composition or portrait storage; the retained recorded-data adapter remains a fixture adapter.
