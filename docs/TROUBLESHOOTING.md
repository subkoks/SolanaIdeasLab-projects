# Troubleshooting

## Local npm mirror rewrites lockfiles (important)

On some local machines `npm install` resolves packages through a **local npm
mirror** (e.g. `pkgs.safetycli.com`) instead of `registry.npmjs.org`. This
changes the `resolved` URLs inside `package-lock.json` even when the dependency
graph is unchanged. The rewritten lockfile is **functionally identical** (same
package versions), but committing it pollutes the repo with mirror URLs and
creates noisy diffs.

**Rule:** never commit a lockfile that was rewritten by the local mirror. After
any local `npm install`, if `git status` shows a `package-lock.json` change you
did not intend, restore it:

```bash
git checkout -- <project>/package-lock.json
```

The committed lockfiles all point at `registry.npmjs.org` and are what CI uses.
If you are deliberately updating a lockfile (e.g. fixing a CI failure), regenerate
it with a clean `npm install` against `registry.npmjs.org` and review the diff
before committing.

## Bootstrap

### `npm ci` / lockfile out of sync

```bash
cd <project> && npm install
# commit package-lock.json ONLY if you are intentionally changing dependencies
```

CI uses Node 22 — regenerate lockfile with Node 22 if local Node differs.

### `prisma migrate deploy skipped (DB unavailable)`

Postgres not running or wrong `DATABASE_URL`.

```bash
brew services start postgresql@16
createdb token_sniper
createdb wallet_tracker
createdb token_safety
cd <project> && npm run db:migrate:deploy
```

### Watchman recrawl warnings (macOS)

Harmless for tests. To silence:

```bash
watchman watch-del ~/Projects/SolanaIdeasLab-projects
watchman watch-project ~/Projects/SolanaIdeasLab-projects
```

---

## Ports in use

| Port | Service |
|---|---|
| 3000 | token-safety-bot |
| 3001 | wallet-tracker-pro |
| 8000 | token-sniper-bot |

```bash
lsof -i :3000
kill <pid>
```

Or change `PORT` in the project `.env`.

---

## Telegram bot not responding

1. `TELEGRAM_BOT_TOKEN` set in correct project `.env`
2. Process running (`npm run dev` or `npm run bot:dev` for wallet)
3. Only **one** process per bot token (polling conflict)
4. For wallet tracker, bot is **separate** from `npm run dev`

---

## Billing stays mock

Expected when `STRIPE_SECRET_KEY` is empty.

Mock flows:

- Wallet dashboard: **Mock upgrade** / **Simulate webhook**
- Wallet Telegram: `/upgrade pro`
- Sniper/safety: HTTP mock checkout + upgrade endpoints

Dashboard **Stripe checklist** shows what is still missing for live mode.

---

## Wallet checkout — tier not updating

**Mock:** set the explicit local flags in `.env`, then use Simulate webhook or
mock-upgrade after checkout redirect. These routes intentionally return 403
outside `NODE_ENV=development`.

**Stripe:** ensure:

1. `stripe listen` forwarding to port 3001
2. `STRIPE_WEBHOOK_SECRET` matches CLI or dashboard
3. Checkout included `metadata.chatId`
4. Poll: `GET /api/billing/subscriber?chatId=...`

---

## Sniper dashboard blank / CSP errors

Open http://localhost:8000/dashboard/alerts (not file://).  
Static assets load from `/dashboard/static/`.  
Check sniper logs if `public/` folder missing.

---

## Safety bot won't start in production

`assertProductionConfig()` fails on default JWT or dev bypass flags.  
Set a real `JWT_SECRET` and disable `SKIP_WALLET_SIGNATURE_VERIFY`.

---

## CI: Auto PR Review fails

Known issue (Anthropic API limit). **Merge gate is `verify`** (test + type-check + lint per project).

---

## Still stuck?

1. Re-run bootstrap: `./scripts/local-dev-bootstrap.sh`
2. Per-project tests: `npm test`
3. See [SETUP.md](./SETUP.md) and [USAGE.md](./USAGE.md)
