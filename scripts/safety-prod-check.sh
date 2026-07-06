#!/usr/bin/env bash
# Production readiness smoke check for token-safety-bot.
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"

echo "Checking token-safety-bot at ${BASE_URL}"

ready_payload="$(curl -sf "${BASE_URL}/ready" || true)"
if [[ -z "${ready_payload}" ]]; then
  echo "FAIL: /ready unreachable" >&2
  exit 1
fi

if ! echo "${ready_payload}" | grep -q '"ready":true'; then
  echo "FAIL: /ready not ready" >&2
  echo "${ready_payload}" >&2
  exit 1
fi

echo "OK: /ready"

health_payload="$(curl -sf "${BASE_URL}/health" || true)"
if [[ -z "${health_payload}" ]]; then
  echo "FAIL: /health unreachable" >&2
  exit 1
fi

if ! echo "${health_payload}" | grep -q '"status"'; then
  echo "FAIL: /health malformed" >&2
  exit 1
fi

echo "OK: /health"
echo "${health_payload}"
