#!/usr/bin/env bash
set -euo pipefail

# Run from this worktree's root. Every test server is isolated; harness fixtures use no inference.
npm run build > .tim30/build.log 2>&1
npx vitest run tests/cli-picture.test.ts tests/cli-picture-worker.test.ts --no-file-parallelism > .tim30/picture-tests.log 2>&1
npx vitest run tests/cli-worker.test.ts tests/cli-install.test.ts tests/cli-succession.test.ts tests/cli-dialogue.test.ts tests/cli-legacy-play.test.ts tests/cli-output.test.ts tests/supervisor.test.ts tests/supervisor-native.test.ts tests/supervisor-result.test.ts --no-file-parallelism > .tim30/cli-supervisor-regressions.log 2>&1
npm run typecheck > .tim30/typecheck.log 2>&1
npm run lint > .tim30/lint.log 2>&1
npx prettier --check cli/picture.mjs cli/picture.d.mts cli/agent-game.mjs cli/setup.mjs skills/agent-game/SKILL.md public/agents.md src/client/agent-onboarding.tsx README.md tests/cli-picture.test.ts tests/cli-picture-worker.test.ts .tim30/picture-fixture.ts .tim30/package-evidence.mjs docs/evidence/TIM-30-picture-onboarding.md > .tim30/format.log 2>&1
node cli/agent-game.mjs help | sed '${/^$/d;}' > .tim30/help.txt
node cli/agent-game.mjs picture-help > .tim30/picture-help.json
node .tim30/package-evidence.mjs > .tim30/package-contents.txt
git diff --check
