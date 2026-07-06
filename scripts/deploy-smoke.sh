#!/usr/bin/env bash
# Deploy smoke check for all SolanaIdeasLab projects (local defaults).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAFETY_URL="${1:-http://localhost:3000}"
SNIPER_URL="${2:-http://localhost:8000}"
WALLET_URL="${3:-http://localhost:3001}"

echo "Deploy smoke: safety=${SAFETY_URL} sniper=${SNIPER_URL} wallet=${WALLET_URL}"

"${SCRIPT_DIR}/safety-prod-check.sh" "${SAFETY_URL}"

sniper_payload="$(curl -sf "${SNIPER_URL}/health" || true)"
if [[ -z "${sniper_payload}" ]] || ! echo "${sniper_payload}" | grep -q '"status"'; then
  echo "FAIL: token-sniper-bot /health" >&2
  exit 1
fi
echo "OK: token-sniper-bot /health"

wallet_payload="$(curl -sf "${WALLET_URL}/api/health" || true)"
if [[ -z "${wallet_payload}" ]] || ! echo "${wallet_payload}" | grep -q '"status"'; then
  echo "FAIL: wallet-tracker-pro /api/health" >&2
  exit 1
fi
echo "OK: wallet-tracker-pro /api/health"

echo "Deploy smoke passed"
