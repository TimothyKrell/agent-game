#!/usr/bin/env bash
set -euo pipefail
export TIM27_PLAYABLE_PORT_BASE="${TIM27_PLAYABLE_PORT_BASE:-6431}"
mkdir -p .tim27-playable/runs
export TIM27_PLAYABLE_EVIDENCE_DIR="${TIM27_PLAYABLE_EVIDENCE_DIR:-$(mktemp -d .tim27-playable/runs/verify-XXXXXXXX)}"
mkdir -p "$TIM27_PLAYABLE_EVIDENCE_DIR"
if [[ -n "$(find "$TIM27_PLAYABLE_EVIDENCE_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  printf 'Use a fresh evidence directory: %s\n' "$TIM27_PLAYABLE_EVIDENCE_DIR" >&2
  exit 1
fi
printf 'Evidence: %s\n' "$TIM27_PLAYABLE_EVIDENCE_DIR"
npm run build > "$TIM27_PLAYABLE_EVIDENCE_DIR/build.log" 2>&1
node_modules/.bin/vitest run tests/preview-playable.test.ts --no-file-parallelism --bail=1 --reporter=default --reporter=json --outputFile.json="$TIM27_PLAYABLE_EVIDENCE_DIR/vitest.json" > "$TIM27_PLAYABLE_EVIDENCE_DIR/vitest.log" 2>&1
npm run typecheck > "$TIM27_PLAYABLE_EVIDENCE_DIR/typecheck.log" 2>&1
node_modules/.bin/tsc --noEmit -p .tim27-playable/tsconfig.json > "$TIM27_PLAYABLE_EVIDENCE_DIR/fixture-typecheck.log" 2>&1
npm run lint > "$TIM27_PLAYABLE_EVIDENCE_DIR/lint.log" 2>&1
node_modules/.bin/oxlint .tim27-playable > "$TIM27_PLAYABLE_EVIDENCE_DIR/fixture-lint.log" 2>&1
node_modules/.bin/prettier --check .tim27-playable/*.ts .tim27-playable/*.mjs .tim27-playable/*.cjs .tim27-playable/*.json .tim27-playable/*.jsonc tests/preview-playable.test.ts docs/evidence/TIM-27-playable-local.md > "$TIM27_PLAYABLE_EVIDENCE_DIR/format.log" 2>&1
node .tim27-playable/asset-check.mjs > "$TIM27_PLAYABLE_EVIDENCE_DIR/asset-exclusion.json"
git diff --check
node .tim27-playable/report.mjs "$TIM27_PLAYABLE_EVIDENCE_DIR" > "$TIM27_PLAYABLE_EVIDENCE_DIR/verification.json"
