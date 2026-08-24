import type { Express } from 'express'
import Stripe from 'stripe'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { TokenSafetyBot } from '../src/index'

// JSON fallback DB keeps this suite hermetic: no Postgres, no network.
// Stripe keys come from tests/setup.ts so the route uses the real
// signature-verification + claim/release path.

const buildCheckoutEvent = (
  eventId: string,
  userId: string,
  tier: string,
  priceId: string,
): Stripe.Event => ({
  id: eventId,
  object: 'event',
  api_version: '2025-05-28.basil',
  created: Math.floor(Date.now() / 1000),
  type: 'checkout.session.completed',
  livemode: false,
  pending_webhooks: 0,
  request: { id: null, idempotency_key: null },
  data: {
    object: {
      id: `cs_${eventId}`,
      object: 'checkout.session',
      client_reference_id: userId,
      metadata: { tier, userId },
      subscription: `sub_${eventId}`,
    } as unknown as Stripe.Checkout.Session,
  },
})

const signEvent = (event: Stripe.Event): string =>
  Stripe.webhooks.generateTestHeaderString({
    payload: JSON.stringify(event),
    secret: process.env.STRIPE_WEBHOOK_SECRET as string,
  })

const postWebhook = (
  app: Express,
  event: Stripe.Event,
): Promise<request.Response> =>
  request(app)
    .post('/webhook/stripe')
    .set('stripe-signature', signEvent(event))
    .set('Content-Type', 'application/json')
    .send(event)

describe('Stripe webhook HTTP endpoint', () => {
  let tmpDir: string
  let storePath: string

  beforeAll(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'tsb-webhook-http-'))
    storePath = path.join(tmpDir, 'store.json')
    process.env.DATA_STORE_PATH = storePath
  })

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('rejects a request with a missing Stripe signature (real verification path)', async () => {
    const bot = new TokenSafetyBot()
    const app = bot.getApp()

    const event = buildCheckoutEvent('evt_nosig', 'user-1', 'pro', 'price_pro')
    const res = await request(app)
      .post('/webhook/stripe')
      .set('Content-Type', 'application/json')
      .send(event)

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ error: 'Missing Stripe signature header' })
  })

  it('does not apply tier sync twice when the same event is delivered twice', async () => {
    const bot = new TokenSafetyBot()
    const app = bot.getApp()
    const db = (bot as unknown as { databaseService: any }).databaseService
    // Production requires the user to exist before Stripe fires; seed it.
    await db.seedUser({
      id: 'user-dup',
      walletAddress: 'user-dup',
      subscriptionTier: 'free',
    })

    const event = buildCheckoutEvent('evt_dup', 'user-dup', 'pro', 'price_pro')

    const first = await postWebhook(app, event)
    expect(first.status).toBe(200)
    expect(first.body).toEqual({
      received: true,
      synced: true,
      type: 'checkout.session.completed',
    })

    const tierAfterFirst = db.users.get('user-dup')?.subscriptionTier

    const second = await postWebhook(app, event)
    expect(second.status).toBe(200)
    expect(second.body).toEqual({
      duplicate: true,
      received: true,
      synced: false,
      type: 'checkout.session.completed',
    })

    // The duplicate must NOT re-run the side effect: the stored tier is
    // unchanged and the event is recorded as processed exactly once.
    expect(db.users.get('user-dup')?.subscriptionTier).toBe(tierAfterFirst)
    expect(db.stripeWebhookEvents.get('evt_dup')?.status).toBe('processed')
  })

  it('releases the claim when processing throws so a retry can succeed', async () => {
    const bot = new TokenSafetyBot()
    const app = bot.getApp()
    const db = (bot as unknown as { databaseService: any }).databaseService
    await db.seedUser({
      id: 'user-retry',
      walletAddress: 'user-retry',
      subscriptionTier: 'free',
    })

    const event = buildCheckoutEvent('evt_retry', 'user-retry', 'pro', 'price_pro')

    // Inject a transient failure in the sync side effect only. The route's real
    // claim/release logic still executes around it; no production code path is
    // bypassed or weakened.
    const realSync = db.syncSubscriptionFromStripe.bind(db)
    let attempt = 0
    db.syncSubscriptionFromStripe = async (
      userId: string,
      tier: 'free' | 'basic' | 'pro' | 'enterprise',
      subscriptionId: string | null,
      status: 'active' | 'cancelled',
    ) => {
      attempt += 1
      if (attempt === 1) {
        throw new Error('simulated downstream failure')
      }
      return realSync(userId, tier, subscriptionId, status)
    }

    const first = await postWebhook(app, event)
    expect(first.status).toBe(400)
    expect(first.body).toMatchObject({ error: 'simulated downstream failure' })
    // After failure the claim must be released: not processing, not present.
    expect(db.stripeWebhookEvents.get('evt_retry')).toBeUndefined()

    // Retry of the same event now succeeds (claim re-acquired, synced).
    const retry = await postWebhook(app, event)
    expect(retry.status).toBe(200)
    expect(retry.body).toEqual({
      received: true,
      synced: true,
      type: 'checkout.session.completed',
    })
    expect(db.stripeWebhookEvents.get('evt_retry')?.status).toBe('processed')
  })
})
