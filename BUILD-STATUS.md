# SolanaIdeasLab Projects — Build Status

Last updated: 2026-08-21 (phase 21)

## Summary

| Project | Status | Next milestone |
|---|---|---|
| **token-safety-bot** | Replay-safe wallet auth + atomic scan quotas | Production migration + API smoke |
| **token-sniper-bot** | Replay-safe wallet auth + auth-gated analysis | Production Redis/DB smoke |
| **wallet-tracker-pro** | Dev-only billing + same-origin checkout returns | Authenticated subscriber identity |

## Phase 21 — Trust/Risk Gateway continuation

**Done**
- Strategy re-ranked around a Trust/Risk Gateway in the companion planning repo.
- Safety and sniper wallet login now require server-issued, single-use challenges in verified environments.
- Wallet Tracker mock upgrades and simulated webhooks are development-only.
- Wallet Tracker Stripe return URLs are constrained to `APP_BASE_URL`.
- Added the missing direct `react-is` dependency required by Recharts; production build now passes.

**Next**
- Replace chat-ID-only wallet billing identity with an authenticated subscriber session.
- Derive subscription entitlements from live database state and add webhook idempotency keys.
- Expose a bounded, provenance-bearing risk endpoint for agent and x402 clients.

## wallet-tracker-pro

**Done (phase 19)**
- Mock checkout return uses URL params (`chatId`, `tier`) — no sessionStorage for billing state
- CodeQL: removed bot username from launch logs

**Done (phase 18)**
- Billing status includes `stripeConfig` readiness (keys/webhook/prices booleans)
- Dashboard Stripe checklist + **Simulate webhook** button (mock mode)

## token-sniper-bot

**Done (phase 19)**
- **`DASHBOARD_ACCESS_TOKEN`** — optional Bearer auth on `/dashboard/alerts`, `/api/v1/alerts/metrics`, `/history`
- Dashboard UI: access token field + `?access_token=` deep link
- CodeQL: validated endpoint rate-limit lookup; redacted Telegram username from startup logs

**Done (phase 18)**
- **`/dashboard/alerts`** — static alert metrics/history dashboard
- CSP-tuned helmet for dashboard static assets

## token-safety-bot

**Done (phase 19)**
- Production CORS: wildcard `CORS_ORIGIN=*` no longer reflects any origin in production
- CodeQL: removed bot username from Telegram launch log

**Done (phase 18)**
- `scripts/production-deploy-checklist.sh` — env/migration/stripe/smoke steps

## Stripe local testing

```bash
# Wallet tracker (port 3001) — live path
stripe listen --forward-to localhost:3001/api/webhooks/stripe

# Mock/dev without Stripe CLI
curl -X POST http://localhost:3001/api/billing/simulate-webhook \
  -H 'Content-Type: application/json' \
  -d '{"chatId":"YOUR_CHAT_ID","tier":"pro"}'
```

Keys guide: `~/Desktop/SolanaIdeasLab-API-Keys-Guide.md`

## Commands

```bash
./scripts/local-dev-bootstrap.sh
./scripts/production-deploy-checklist.sh
./scripts/deploy-smoke.sh
# Sniper alert dashboard: http://localhost:8000/dashboard/alerts
```

## Documentation

User guides (setup, usage, API keys, deploy): **[docs/README.md](./docs/README.md)**

Verification and production keys are optional for initial local dev.
