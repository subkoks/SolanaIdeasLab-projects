#!/usr/bin/env bash
# local-dev-bootstrap.sh — local equivalent of Claude Code cloud-setup + env skeleton.
#
# Usage (from repo root):
#   scripts/local-dev-bootstrap.sh
#   scripts/local-dev-bootstrap.sh --check   # type-check only, skip npm ci
#
# Does NOT commit .env files. Copy .env.example → .env only when .env is missing.
#
# After bootstrap, the local fixture lab (no keys / no live chain) is:
#   Console  http://localhost:3002/          → cd solana-lab-console && npm run dev
#   Safety   http://localhost:3000/demo      → cd token-safety-bot && npm run dev
#   Sniper   http://localhost:8000/demo      → cd token-sniper-bot && npm run dev
#   Wallet   http://localhost:3001/demo      → cd wallet-tracker-pro && npm run dev
# Smoke (servers already up): scripts/local-lab-smoke.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

log() { printf '[bootstrap] %s\n' "$*"; }

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

MISE_NODE_BIN=""

select_node() {
  local major="$1"
  local mise_node
  local path_without_mise

  if [ -n "$MISE_NODE_BIN" ]; then
    path_without_mise=":$PATH:"
    path_without_mise="${path_without_mise//:"$MISE_NODE_BIN":/:}"
    path_without_mise="${path_without_mise#:}"
    export PATH="${path_without_mise%:}"
    MISE_NODE_BIN=""
    hash -r
  fi

  if type nvm >/dev/null 2>&1 && nvm use "$major" >/dev/null 2>&1; then
    hash -r
    return 0
  fi

  if command -v mise >/dev/null 2>&1 &&
    mise_node="$(mise where "node@$major" 2>/dev/null)" &&
    [ -x "$mise_node/bin/node" ]; then
    MISE_NODE_BIN="$mise_node/bin"
    export PATH="$MISE_NODE_BIN:$PATH"
    hash -r
    log "using Node $(node --version) for major $major via mise"
    return 0
  fi

  log "Node $major is required but is unavailable through nvm or mise"
  return 1
}

if command -v createdb >/dev/null 2>&1; then
  createdb token_sniper 2>/dev/null || true
  createdb wallet_tracker 2>/dev/null || true
  createdb token_safety 2>/dev/null || true
  log "postgres: token_sniper + wallet_tracker + token_safety (create if missing)"
fi

for proj in token-safety-bot token-sniper-bot wallet-tracker-pro; do
  dir="$ROOT/$proj"
  [ -d "$dir" ] || continue
  log "=== $proj ==="
  select_node 24
  if [ ! -f "$dir/.env" ] && [ -f "$dir/.env.example" ]; then
    cp "$dir/.env.example" "$dir/.env"
    log "  .env copied from .env.example (edit secrets before prod)"
  fi
  if [ "$CHECK_ONLY" -eq 0 ]; then
    (cd "$dir" && npm ci)
  fi
  if [ -f "$dir/prisma/schema.prisma" ] || [ -f "$dir/prisma.config.ts" ]; then
    (cd "$dir" && npm run db:generate)
    if [ -d "$dir/prisma/migrations" ] && [ -n "$(find "$dir/prisma/migrations" -mindepth 1 -maxdepth 1 ! -name migration_lock.toml -print -quit)" ]; then
      (cd "$dir" && npm run db:migrate:deploy 2>/dev/null) || log "  prisma migrate deploy skipped (DB unavailable)"
    fi
  fi
  (cd "$dir" && npm run type-check)
done

log "=== design tokens (read-only drift check) ==="
select_node 24
(cd "$ROOT" && node shared/design/check-tokens.js)

log "=== solana-lab-console (static launcher; no npm install) ==="
(cd "$ROOT/solana-lab-console" && npm test)

log "[DONE] SolanaIdeasLab projects bootstrapped."
log "Fixture lab (start each in its own terminal, then open Console):"
log "  cd solana-lab-console && npm run dev     → http://localhost:3002/"
log "  cd token-safety-bot && npm run dev       → http://localhost:3000/demo"
log "  cd token-sniper-bot && npm run dev       → http://localhost:8000/demo"
log "  cd wallet-tracker-pro && npm run dev     → http://localhost:3001/demo"
log "Smoke when servers are up: scripts/local-lab-smoke.sh"
