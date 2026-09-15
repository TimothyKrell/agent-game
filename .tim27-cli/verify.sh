#!/usr/bin/env bash
set -euo pipefail

# Override the base when another lane owns the default 6361–6364 range.
export TIM27_CLI_PORT_BASE="${TIM27_CLI_PORT_BASE:-6361}"
export TIM30_PORT_BASE="${TIM30_PORT_BASE:-$((TIM27_CLI_PORT_BASE + 1))}"
mkdir -p .tim27-cli/runs
export TIM27_CLI_EVIDENCE_DIR="${TIM27_CLI_EVIDENCE_DIR:-$(mktemp -d .tim27-cli/runs/verify-XXXXXXXX)}"
mkdir -p "$TIM27_CLI_EVIDENCE_DIR"
printf 'Evidence directory: %s\n' "$TIM27_CLI_EVIDENCE_DIR"
npm run build > "$TIM27_CLI_EVIDENCE_DIR/build.log" 2>&1
npx vitest run tests/cli-preview.test.ts --no-file-parallelism > "$TIM27_CLI_EVIDENCE_DIR/preview-tests.log" 2>&1
npx vitest run tests/cli-preview-wake.test.ts tests/supervisor-http.test.ts tests/cli-picture.test.ts tests/cli-picture-worker.test.ts tests/cli-worker.test.ts tests/cli-install.test.ts tests/cli-succession.test.ts tests/cli-dialogue.test.ts tests/cli-legacy-play.test.ts tests/cli-output.test.ts tests/supervisor.test.ts tests/supervisor-native.test.ts tests/supervisor-result.test.ts --no-file-parallelism > "$TIM27_CLI_EVIDENCE_DIR/regressions.log" 2>&1
npm run typecheck > "$TIM27_CLI_EVIDENCE_DIR/typecheck.log" 2>&1
npx tsc --noEmit -p .tim27-cli/tsconfig.json > "$TIM27_CLI_EVIDENCE_DIR/fixture-typecheck.log" 2>&1
npm run lint > "$TIM27_CLI_EVIDENCE_DIR/lint.log" 2>&1
npx oxlint .tim27-cli > "$TIM27_CLI_EVIDENCE_DIR/fixture-lint.log" 2>&1
npx prettier --check cli/agent-game.mjs cli/agent-game.d.mts cli/current.mjs cli/setup.mjs cli/supervisor.mjs cli/http-response.mjs cli/preview-artifacts.mjs cli/preview-artifacts.d.mts cli/preview-select.mjs tests/cli-preview.test.ts tests/cli-preview-wake.test.ts tests/supervisor-http.test.ts tests/supervisor-native.test.ts tests/cli-succession.test.ts .tim27-cli/*.ts .tim27-cli/*.json .tim27-cli/*.jsonc skills/agent-game/SKILL.md public/agents.md docs/evidence/TIM-27-preview-cli.md > "$TIM27_CLI_EVIDENCE_DIR/format.log" 2>&1
node .tim30/package-evidence.mjs > "$TIM27_CLI_EVIDENCE_DIR/package-contents.txt"
git diff --check
