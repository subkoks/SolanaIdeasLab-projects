#!/usr/bin/env bash
# Local verification helper for SolanaIdeasLab-projects.
# Runs type-check + unit tests for every package WITHOUT deployments,
# wallets, secrets, or any external state change.
#
# IMPORTANT: `shared/` is verified with its OWN `npm install` (never the
# node_modules symlink into a bot). The symlink made tests falsely green by
# reusing the bot's hoisted deps; a clean isolated install is what CI runs and
# is the only reliable signal. If shared/node_modules is a symlink, it is
# removed first so the script can't accidentally use it.
#
# Usage: bash scripts/test-all.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOTS=(token-safety-bot token-sniper-bot wallet-tracker-pro)

echo "==> Verifying shared/ (self-contained package, clean isolated install)"
cd "$ROOT/shared"
# Never trust a symlinked node_modules — CI uses a real install.
if [ -L node_modules ]; then
  echo "shared/node_modules is a symlink; removing so we install for real" >&2
  rm -f node_modules
fi
if [ ! -d node_modules ]; then
  npm install
fi
npm run type-check
npm test
npm run lint
npm run build

for bot in "${BOTS[@]}"; do
  echo "==> Verifying $bot (type-check + test)"
  cd "$ROOT/$bot"
  npm run type-check
  npm test
done

echo "==> All packages type-check + test green (local, no deploy)."
