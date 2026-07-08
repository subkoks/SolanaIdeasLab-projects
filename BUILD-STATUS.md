# SolanaIdeasLab Projects — Build Status

Last updated: 2026-07-06 (phase 18)

## Summary

| Project | Status | Next milestone |
|---|---|---|
| **token-safety-bot** | Production deploy checklist script | Hosted deploy |
| **token-sniper-bot** | `/dashboard/alerts` UI | Auth-gated dashboard |
| **wallet-tracker-pro** | Stripe config status + simulate webhook UI | Live Stripe with production keys |

## wallet-tracker-pro

**Done (phase 18)**
- Billing status includes `stripeConfig` readiness (keys/webhook/prices booleans)
- Dashboard Stripe checklist + **Simulate webhook** button (mock mode)

**Done (phase 17)**
- Dev webhook sim, `/api/health`, subscriber poll

## token-sniper-bot

**Done (phase 18)**
- **`/dashboard/alerts`** — static alert metrics/history dashboard
- CSP-tuned helmet for dashboard static assets

**Done (phase 17)**
- Alert delivery history API + Telegram `/history`

## token-safety-bot

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
