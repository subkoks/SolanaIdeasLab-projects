#!/usr/bin/env bash
# local-lab-smoke.sh — HTTP smoke for the local fixture lab surfaces.
#
# Expects the four local servers already running (does not start them).
# Uses only curl against localhost. No secrets, wallets, RPC, or installs.
#
# Usage (from repo root):
#   scripts/local-lab-smoke.sh
#
# Optional URL overrides (defaults match the fixed port map):
#   CONSOLE_URL SAFETY_DEMO_URL SNIPER_DEMO_URL WALLET_DEMO_URL
set -euo pipefail

CONSOLE_URL="${CONSOLE_URL:-http://localhost:3002/}"
SAFETY_DEMO_URL="${SAFETY_DEMO_URL:-http://localhost:3000/demo}"
SNIPER_DEMO_URL="${SNIPER_DEMO_URL:-http://localhost:8000/demo}"
WALLET_DEMO_URL="${WALLET_DEMO_URL:-http://localhost:3001/demo}"

fail=0

check() {
  local name="$1"
  local url="$2"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 2 --max-time 5 "$url" || true)"
  if [[ "$code" == "200" ]]; then
    printf 'OK: %s (%s) → %s\n' "$name" "$url" "$code"
  else
    printf 'FAIL: %s (%s) → %s\n' "$name" "$url" "${code:-unreachable}" >&2
    fail=1
  fi
}

echo "Local fixture lab smoke (servers must already be running)"
check "Solana Lab Console" "$CONSOLE_URL"
check "Token Safety demo" "$SAFETY_DEMO_URL"
check "Token Sniper demo" "$SNIPER_DEMO_URL"
check "Wallet Tracker demo" "$WALLET_DEMO_URL"

if [[ "$fail" -ne 0 ]]; then
  echo "Local lab smoke failed. Start servers with:" >&2
  echo "  cd solana-lab-console && npm run dev" >&2
  echo "  cd token-safety-bot && npm run dev" >&2
  echo "  cd token-sniper-bot && npm run dev" >&2
  echo "  cd wallet-tracker-pro && npm run dev" >&2
  exit 1
fi

echo "Local lab smoke passed"
