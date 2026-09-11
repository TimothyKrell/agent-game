# Anti-slop provenance

- Source: https://github.com/dmmulroy/anti-slop
- Commit: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`
- Installed: 2026-09-11
- Copied from: `skills/install-anti-slop/assets/anti-slop/` at that commit, using its `scripts/install.mjs`.
- Verified the bundled assets match upstream `src/` with `node scripts/sync-skill-assets.mjs --check` before copying. Upstream excludes `*.test.ts` from the distributed assets.
- Generic entry point: `tools/oxlint/anti-slop/index.ts`
- Effect entry point: `tools/oxlint/anti-slop/effect/index.ts`
- Toolchain: `oxlint@1.82.0` and `@oxlint/plugins@1.82.0`, pinned together as development dependencies.

## Local integration

All 18 generic rules, the native `oxc/no-accumulating-spread` companion, and all five Effect rules are enabled at error severity in `.oxlintrc.json`. Effect rules are enabled because the application directly depends on Effect.

The vendored code is excluded from application linting and formatting. It is typechecked separately through `tsconfig.oxlint.json`, included in `npm run typecheck`. Generated output and project-local agent tooling are excluded from linting.

There are no local changes to the copied plugin source. This provenance file and the upstream root MIT `LICENSE` are additions. The nested ESLint Stylistic license and provenance are preserved in `vendor/eslint-stylistic/`.

For updates, compare against this exact upstream revision and preserve any subsequent local customizations.
