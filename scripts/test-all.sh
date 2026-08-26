#!/usr/bin/env bash
# Local verification helper for SolanaIdeasLab-projects.
# Runs type-check + unit tests for every package WITHOUT network access,
# deployments, wallets, secrets, or any external state change.
#
# Usage: bash scripts/test-all.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOTS=(token-safety-bot token-sniper-bot wallet-tracker-pro)

echo "==> Verifying shared/ (self-contained package)"
cd "$ROOT/shared"
if [ -L node_modules ] || [ -d node_modules ]; then
  node ../token-safety-bot/node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
  node ../token-safety-bot/node_modules/jest/bin/jest.js --rootDir .
else
  echo "shared/node_modules missing — symlink it: ln -sfn ../token-safety-bot/node_modules ./node_modules" >&2
  exit 1
fi

for bot in "${BOTS[@]}"; do
  echo "==> Verifying $bot (type-check + test)"
  cd "$ROOT/$bot"
  npm run type-check
  npm test
done

echo "==> All packages type-check + test green (local, no deploy)."
