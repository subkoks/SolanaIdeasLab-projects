import {
  buildSubscriberTierSyncFromEvent,
  type StripePriceIds,
} from '../src/lib/stripe-webhook'

const prices: StripePriceIds = {
  basic: 'price_basic_123',
  pro: 'price_pro_456',
  enterprise: 'price_ent_789',
}

// Minimal Stripe.Event-shaped fixtures (only the fields the mapper reads).
const makeEvent = (type: string, object: any): any => ({
  type,
  data: { object },
})

describe('buildSubscriberTierSyncFromEvent', () => {
  it('maps a completed checkout session with metadata to an active tier', () => {
    const event = makeEvent('checkout.session.completed', {
      metadata: { chatId: 'chat-1', tier: 'pro' },
    })
    expect(buildSubscriberTierSyncFromEvent(event, prices)).toEqual({
      chatId: 'chat-1',
      tier: 'pro',
      status: 'active',
    })
  })

  it('rejects a completed checkout that targets the free tier', () => {
    const event = makeEvent('checkout.session.completed', {
      metadata: { chatId: 'chat-1', tier: 'free' },
    })
    expect(buildSubscriberTierSyncFromEvent(event, prices)).toBeNull()
  })

  it('rejects when chatId or tier metadata is missing/invalid', () => {
    expect(
      buildSubscriberTierSyncFromEvent(
        makeEvent('checkout.session.completed', { metadata: { tier: 'pro' } }),
        prices,
      ),
    ).toBeNull()
    expect(
      buildSubscriberTierSyncFromEvent(
        makeEvent('checkout.session.completed', {
          metadata: { chatId: 'chat-1', tier: 'platinum' },
        }),
        prices,
      ),
    ).toBeNull()
  })

  it('maps subscription deletion to free / cancelled', () => {
    const event = makeEvent('customer.subscription.deleted', {
      metadata: { chatId: 'chat-2' },
    })
    expect(buildSubscriberTierSyncFromEvent(event, prices)).toEqual({
      chatId: 'chat-2',
      tier: 'free',
      status: 'cancelled',
    })
  })

  it('maps inactive subscription statuses to free / cancelled', () => {
    for (const status of ['canceled', 'unpaid', 'incomplete_expired']) {
      const event = makeEvent('customer.subscription.updated', {
        metadata: { chatId: 'chat-3' },
        status,
        items: { data: [{ price: { id: prices.pro } }] },
      })
      expect(buildSubscriberTierSyncFromEvent(event, prices)).toEqual({
        chatId: 'chat-3',
        tier: 'free',
        status: 'cancelled',
      })
    }
  })

  it('derives the tier from the subscribed price id, not just metadata', () => {
    const event = makeEvent('customer.subscription.updated', {
      metadata: { chatId: 'chat-4' },
      status: 'active',
      items: { data: [{ price: { id: prices.enterprise } }] },
    })
    expect(buildSubscriberTierSyncFromEvent(event, prices)).toEqual({
      chatId: 'chat-4',
      tier: 'enterprise',
      status: 'active',
    })
  })

  it('returns null for unrecognized event types', () => {
    const event = makeEvent('invoice.paid', { metadata: { chatId: 'x' } })
    expect(buildSubscriberTierSyncFromEvent(event, prices)).toBeNull()
  })
})
