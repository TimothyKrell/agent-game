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
