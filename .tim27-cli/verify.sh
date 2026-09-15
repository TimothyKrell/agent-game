#!/usr/bin/env bash
set -euo pipefail

# This lane owns 6361–6364. TIM-30 fixture ports move here for the serial regression run.
export TIM30_PORT_BASE=6362
npm run build > .tim27-cli/build.log 2>&1
npx vitest run tests/cli-preview.test.ts --no-file-parallelism > .tim27-cli/preview-tests.log 2>&1
npx vitest run tests/cli-picture.test.ts tests/cli-picture-worker.test.ts tests/cli-worker.test.ts tests/cli-install.test.ts tests/cli-succession.test.ts tests/cli-dialogue.test.ts tests/cli-legacy-play.test.ts tests/cli-output.test.ts tests/supervisor.test.ts tests/supervisor-native.test.ts tests/supervisor-result.test.ts --no-file-parallelism > .tim27-cli/regressions.log 2>&1
npm run typecheck > .tim27-cli/typecheck.log 2>&1
npx tsc --noEmit -p .tim27-cli/tsconfig.json > .tim27-cli/fixture-typecheck.log 2>&1
npm run lint > .tim27-cli/lint.log 2>&1
npx oxlint .tim27-cli > .tim27-cli/fixture-lint.log 2>&1
npx prettier --check cli/agent-game.mjs cli/agent-game.d.mts cli/current.mjs cli/setup.mjs cli/supervisor.mjs cli/preview-artifacts.mjs cli/preview-artifacts.d.mts cli/preview-select.mjs tests/cli-preview.test.ts tests/cli-succession.test.ts .tim27-cli/*.ts .tim27-cli/*.json .tim27-cli/*.jsonc skills/agent-game/SKILL.md public/agents.md docs/evidence/TIM-27-preview-cli.md > .tim27-cli/format.log 2>&1
node .tim30/package-evidence.mjs > .tim27-cli/package-contents.txt
git diff --check
