# Maintained test support

Run commands from the repository root. Generated reports and runtime storage go to
ignored `test-results/` directories; fixtures contain source and input assets only.

| Responsibility                                        | Maintained source                  |
| ----------------------------------------------------- | ---------------------------------- |
| CLI preview artifacts and local Worker                | `tests/fixtures/cli-preview/`      |
| Agent picture input, Workers and browser checks       | `tests/fixtures/agent-pictures/`   |
| Agent summary Workers and browser checks              | `tests/fixtures/agent-summaries/`  |
| CLI onboarding picture server                         | `tests/fixtures/cli-onboarding/`   |
| Playable preview Workers, native child and assertions | `tests/fixtures/preview-playable/` |
| Preview ordering and isolation integration tests      | `tests/preview-integration/`       |
| Dossier focus and navigation checks                   | `tests/browser/dossier/`           |
| History response capture lifetime checks              | `tests/browser/history-capture/`   |
| Continuous story browser config                       | `tests/browser/story-navigation/`  |
| Foundation controls and rule-help browser checks      | `tests/browser/foundations/`       |
| Vite-only foundation pages                            | `dev/foundations/`                 |

## Test lanes

`vitest.core.config.ts` selects 54 files, `vitest.extended.config.ts` selects 11,
and `vitest.preview-activation.config.ts` selects six. The activation lane includes
the four files in `tests/preview-integration/`; release and core explicitly exclude
them through `previewActivationTests` in `vitest.config.ts`.

The default Playwright config discovers only `e2e/`. Browser checks in this tree
are opt-in, for example:

```sh
npx playwright test --config tests/browser/history-capture/capture-lifetime.config.ts
npx playwright test --config tests/fixtures/agent-pictures/playwright.config.ts
npx playwright test --config tests/fixtures/agent-summaries/summary-playwright.config.ts
```

For foundations and dossier focus, first start Vite on port 6191, then use
`tests/browser/foundations/interaction.config.ts` or
`tests/browser/dossier/focus.config.ts`. Dossier ending checks use port 6291:
start `node tests/browser/dossier/serve.mjs` and use
`tests/browser/dossier/ending.config.ts`. Story navigation uses an existing app
server on port 6283. Worker-backed picture/summary browser checks require a client
build and start their own local fixture server.

The playable harness builds `public/downloads/agent-game-cli-0.3.0.tgz` with
`scripts/package-cli.mjs`, installs that actual package in an isolated runtime,
and generates native executable symlinks there. It does not consume archived
accepted-run packages. After building the app, the package/build exclusion check
is `node tests/fixtures/preview-playable/asset-check.mjs`.
