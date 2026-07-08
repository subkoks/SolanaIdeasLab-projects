# Usage

How to use each app in **dev/mock mode** (no Stripe or Helius required).

## token-safety-bot

### HTTP API (port 3000)

| Endpoint | Description |
|---|---|
| `GET /health` | Service health + metrics |
| `GET /ready` | 503 until DB, queue, Solana checks pass |
| `GET /api/v1/billing/status` | Billing mode (mock when Stripe unset) |
| `POST /api/v1/scan` | Token safety scan (auth required) |

Example:

```bash
curl http://localhost:3000/api/v1/billing/status
```

### Telegram (optional)

Requires `TELEGRAM_BOT_TOKEN` in `token-safety-bot/.env`. Commands are registered in the bot service — scan/monitor flows depend on your wallet auth setup.

Admin chat IDs: `TELEGRAM_ADMIN_CHAT_IDS` (comma-separated).

---

## token-sniper-bot

### Alert dashboard (no Telegram)

http://localhost:8000/dashboard/alerts

- Load **metrics** — delivery counts (24h / 7d)
- Load **launch stats**
- **Token history** — enter a mint address

### HTTP API (port 8000)

| Endpoint | Auth | Description |
|---|---|---|
| `GET /health` | No | Health + LaserStream status |
| `GET /api/v1/alerts/metrics` | No | Alert delivery metrics |
| `GET /api/v1/alerts/history?token=MINT` | No | Delivery log for a token |
| `GET /api/v1/launches/stats` | No | Launch counts |
| `GET /api/v1/launches/recent` | No | Recent detected launches |
| `GET /api/v1/billing/status` | No | Billing mode |
| `POST /api/v1/billing/checkout` | Yes | Checkout session |

### Telegram commands

Requires `TELEGRAM_BOT_TOKEN` in `token-sniper-bot/.env`.

| Command | Description |
|---|---|
| `/start` | Register user in DB |
| `/status` | RPC + launch stats |
| `/stats` | Your tier, alert counts |
| `/history` | Your recent deliveries |
| `/history <mint>` | Deliveries for a token |
| `/alert <mint>` | Create token watch alert |
| `/alerts` | List your active alerts |
| `/stop <alert_id>` | Cancel an alert |
| `/launches` | Launch alert help |
| `/launches subscribe` | Subscribe to launch broadcasts |
| `/launches recent` | Recent launches from DB |
| `/analyze <mint>` | Token analysis |
| `/billing` | Billing mode + tiers |
| `/upgrade <tier>` | Mock upgrade or Stripe checkout URL |

### Helius webhook (optional, keys later)

`POST /webhook/helius/enhanced` — set `HELIUS_WEBHOOK_SECRET` as Authorization header. See [API-KEYS.md](./API-KEYS.md).

---

## wallet-tracker-pro

### Web dashboard (port 3001)

http://localhost:3001

| Section | Action |
|---|---|
| **Live stats** | Refresh subscribers / watches / events |
| **Analytics** | 7-day overview + top wallets |
| **Plans & billing** | Load plans → mock upgrade or checkout |
| **Activity lookup** | Wallet address → activity, charts, portfolio mock USD |

### Billing without Stripe (mock)

1. Open dashboard → **Load plans** (mode: `mock`)
2. Enter your **Telegram chat ID** (from @userinfobot)
3. Choose tier → **Mock upgrade** or **Simulate webhook**

Or via API:

```bash
curl -X POST http://localhost:3001/api/billing/mock-upgrade \
  -H 'Content-Type: application/json' \
  -d '{"chatId":"YOUR_CHAT_ID","tier":"pro"}'
```

Simulate Stripe webhook locally:

```bash
curl -X POST http://localhost:3001/api/billing/simulate-webhook \
  -H 'Content-Type: application/json' \
  -d '{"chatId":"YOUR_CHAT_ID","tier":"pro"}'
```

Check subscriber tier:

```bash
curl 'http://localhost:3001/api/billing/subscriber?chatId=YOUR_CHAT_ID'
```

### Telegram bot

Requires `TELEGRAM_BOT_TOKEN`. Run: `npm run bot:dev`

| Command | Description |
|---|---|
| `/watch <wallet>` | Watch a Solana wallet |
| `/unwatch <wallet>` | Stop watching |
| `/list` | Your active watches |
| `/activity <wallet>` | Recent activity |
| `/limits` | Tier + watch quota |
| `/billing` | Billing status |
| `/upgrade <tier>` | Mock upgrade or checkout link |

### Watch limits by tier

| Tier | Max watches |
|---|---|
| free | 3 |
| basic | 10 |
| pro | 25 |
| enterprise | 100 |

---

## Billing modes (all projects)

| `STRIPE_SECRET_KEY` | Mode | Behavior |
|---|---|---|
| Empty | **mock** | Local tier changes, simulate webhook, mock checkout URLs |
| Set + webhook + price IDs | **stripe** | Real checkout; tier sync via webhooks |

Wallet dashboard shows a **Stripe checklist** (`stripeConfig`) when you load plans.

---

## Stripe (when you add keys later)

See [API-KEYS.md](./API-KEYS.md) and [DEPLOY.md](./DEPLOY.md).

Wallet tracker webhook must receive `metadata.chatId` on checkout for tier sync.

```bash
stripe listen --forward-to localhost:3001/api/webhooks/stripe
```
