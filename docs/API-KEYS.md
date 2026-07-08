# API keys

**You do not need any of this for initial local dev.** Bootstrap with `./scripts/local-dev-bootstrap.sh` and use mock billing.

Add keys in this order when you are ready.

## Env file locations

| Project | File |
|---|---|
| token-sniper-bot | `token-sniper-bot/.env` |
| token-safety-bot | `token-safety-bot/.env` |
| wallet-tracker-pro | `wallet-tracker-pro/.env` |

Never commit `.env` files.

---

## Tier A — dev only (no signup)

| Variable | How to set |
|---|---|
| `JWT_SECRET` | `openssl rand -hex 32` per project |
| `REFRESH_TOKEN_SECRET` | sniper only — `openssl rand -hex 32` |
| `SKIP_WALLET_SIGNATURE_VERIFY=true` | Dev wallet auth without signatures |
| Postgres URLs | Bootstrap defaults |

---

## Tier B — real Solana + Telegram

### Helius (recommended RPC + sniper launches)

1. Sign up: https://dev.helius.xyz
2. Dashboard → **API Keys** → create key

| Variable | Project | Purpose |
|---|---|---|
| `HELIUS_API_KEY` | sniper | LaserStream + Helius APIs |
| `HELIUS_WEBHOOK_SECRET` | sniper | Auth for `POST /webhook/helius/enhanced` |
| `SOLANA_RPC_URL` | all | `https://mainnet.helius-rpc.com/?api-key=KEY` |

**token-sniper-bot/.env:**

```env
HELIUS_API_KEY=your-key
HELIUS_WEBHOOK_SECRET=long-random-string
ENABLE_LASERSTREAM=true
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
```

**Helius enhanced webhook:** point to `https://YOUR_HOST/webhook/helius/enhanced` with Authorization = `HELIUS_WEBHOOK_SECRET`. Local dev: ngrok on port **8000**.

### Telegram

1. Message **@BotFather** → `/newbot` → copy token
2. Get your chat ID: **@userinfobot** or **@getidsbot**

| Variable | Project |
|---|---|
| `TELEGRAM_BOT_TOKEN` | all three |
| `TELEGRAM_BOT_USERNAME` | all three |
| `TELEGRAM_ADMIN_CHAT_IDS` | safety only |

**Run bots:**

```bash
# sniper + safety: npm run dev (Telegram polls in-process)
# wallet: npm run bot:dev
```

---

## Tier C — Stripe billing

1. https://dashboard.stripe.com/register
2. **Developers → API keys** → Secret key (`sk_test_...`)
3. **Products** → create Basic / Pro / Enterprise → copy **Price IDs**
4. **Webhooks → Add endpoint** (test mode):

| Project | Webhook URL | Port |
|---|---|---|
| token-safety-bot | `/webhook/stripe` | 3000 |
| token-sniper-bot | `/webhook/stripe` | 8000 |
| wallet-tracker-pro | `/api/webhooks/stripe` | 3001 |

Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

Copy **Signing secret** (`whsec_...`).

**All projects — same pattern:**

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_BASIC=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...
```

**Wallet tracker:** checkout must include `metadata.chatId` (dashboard + API do this automatically). Tier syncs to Telegram subscriber.

**Local Stripe CLI:**

```bash
# Wallet tracker
stripe listen --forward-to localhost:3001/api/webhooks/stripe

# Sniper
stripe listen --forward-to localhost:8000/webhook/stripe

# Safety
stripe listen --forward-to localhost:3000/webhook/stripe
```

Until Stripe is configured, billing stays **mock** — see [USAGE.md](./USAGE.md).

Optional dev without Stripe CLI:

```bash
curl -X POST http://localhost:3001/api/billing/simulate-webhook \
  -H 'Content-Type: application/json' \
  -d '{"chatId":"YOUR_CHAT_ID","tier":"pro"}'
```

---

## Optional (sniper)

| Variable | Source |
|---|---|
| `COINGECKO_API_KEY` | https://www.coingecko.com/en/api |
| `JUPITER_API_KEY` | https://station.jup.ag |
| `TWITTER_BEARER_TOKEN` | Twitter developer portal |
| `PUMP_FUN_API_KEY` | Leave empty unless you have one |

---

## Minimum “turn on real data” checklist

**Sniper:**

```bash
cd token-sniper-bot
# .env: HELIUS_API_KEY, optional TELEGRAM_BOT_TOKEN
npm run dev
curl http://localhost:8000/health
open http://localhost:8000/dashboard/alerts
```

**Safety:**

```bash
cd token-safety-bot
# .env: DATABASE_URL, JWT_SECRET
npm run dev
curl http://localhost:3000/ready
```

**Wallet tracker:**

```bash
cd wallet-tracker-pro
npm run dev          # dashboard :3001
npm run bot:dev      # Telegram watcher
```

---

## Security

- Use **test** Stripe keys until production
- Production: strong `JWT_SECRET`, `SKIP_WALLET_SIGNATURE_VERIFY=false`
- Rotate any exposed key immediately
- Do not paste live keys in chat or commits

Also on Desktop: `~/Desktop/SolanaIdeasLab-API-Keys-Guide.md` (keep in sync with this file when keys workflow changes).
