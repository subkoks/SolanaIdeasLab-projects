#!/usr/bin/env bash
# Production deploy checklist for SolanaIdeasLab projects (no secrets read).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== SolanaIdeasLab production deploy checklist ==="
echo

check_env_example() {
  local project="$1"
  local example="${ROOT}/${project}/.env.example"
  if [[ -f "${example}" ]]; then
    echo "OK  ${project}/.env.example present"
  else
    echo "MISSING  ${project}/.env.example" >&2
    return 1
  fi
}

echo "1) Environment templates"
check_env_example token-safety-bot
check_env_example token-sniper-bot
check_env_example wallet-tracker-pro
echo

echo "2) Required production settings (set in host env, not committed)"
echo "   - token-safety-bot: JWT_SECRET (non-default), DATABASE_URL, NODE_ENV=production"
echo "   - token-sniper-bot: DATABASE_URL, JWT_SECRET, TELEGRAM_BOT_TOKEN (optional)"
echo "   - wallet-tracker-pro: DATABASE_URL, STRIPE_* + STRIPE_WEBHOOK_SECRET for live billing"
echo

echo "3) Database migrations"
echo "   cd token-sniper-bot && npx prisma migrate deploy"
echo "   cd wallet-tracker-pro && npx prisma migrate deploy"
echo "   (token-safety-bot: see project README for Postgres setup)"
echo

echo "4) Stripe webhook forwarding (wallet tracker port 3001)"
echo "   stripe listen --forward-to localhost:3001/api/webhooks/stripe"
echo

echo "5) Post-deploy smoke (services must be running)"
if "${SCRIPT_DIR}/deploy-smoke.sh" "$@"; then
  echo
  echo "Checklist complete — deploy smoke passed"
else
  echo
  echo "Checklist printed — deploy smoke failed (start services and re-run)" >&2
  exit 1
fi
