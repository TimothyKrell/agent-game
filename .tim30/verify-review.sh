#!/usr/bin/env bash
set -euo pipefail

# Preserve the original logs/captures. This correction run uses its own port range and outputs.
export TIM30_PORT_BASE="${TIM30_PORT_BASE:-6331}"
npm run build > .tim30/review-build.log 2>&1
npx vitest run tests/cli-picture.test.ts tests/cli-picture-worker.test.ts tests/cli-worker.test.ts tests/cli-install.test.ts tests/cli-succession.test.ts tests/cli-dialogue.test.ts tests/cli-legacy-play.test.ts tests/cli-output.test.ts tests/supervisor.test.ts tests/supervisor-native.test.ts tests/supervisor-result.test.ts --no-file-parallelism > .tim30/review-regressions.log 2>&1
npm run typecheck > .tim30/review-typecheck.log 2>&1
npm run lint > .tim30/review-lint.log 2>&1
npx prettier --check cli/durable-json.mjs cli/ledger.mjs cli/picture.mjs .tim30/picture-fixture.ts .tim30/package-evidence.mjs tests/cli-picture.test.ts tests/cli-picture-worker.test.ts docs/evidence/TIM-30-picture-onboarding.md > .tim30/review-format.log 2>&1
node .tim30/package-evidence.mjs > .tim30/review-package-contents.txt
git diff --check
