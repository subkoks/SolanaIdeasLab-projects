# SolanaIdeasLab Projects — Build Status

Last updated: 2026-07-08 (phase 19)

## Summary

| Project | Status | Next milestone |
|---|---|---|
| **token-safety-bot** | CodeQL CORS hardening | Hosted deploy |
| **token-sniper-bot** | Auth-gated dashboard | Hosted deploy |
| **wallet-tracker-pro** | Checkout return via URL params | Live Stripe with production keys |

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
