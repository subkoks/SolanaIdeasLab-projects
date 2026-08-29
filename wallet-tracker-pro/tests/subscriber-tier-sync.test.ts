import { applySubscriberTierSync } from '../src/lib/subscriber-tier-sync'

describe('applySubscriberTierSync', () => {
  it('applies active tier upgrades', async () => {
    const calls: string[] = []
    await applySubscriberTierSync(
      async (chatId) => {
        calls.push(`upsert:${chatId}`)
      },
      async (chatId, tier) => {
        calls.push(`tier:${chatId}:${tier}`)
      },
      { chatId: '12345', tier: 'pro', status: 'active' },
    )

    expect(calls).toEqual(['upsert:12345', 'tier:12345:pro'])
  })

  it('downgrades to free on cancelled status', async () => {
    const calls: string[] = []
    await applySubscriberTierSync(
      async () => undefined,
      async (_chatId, tier) => {
        calls.push(tier)
      },
      { chatId: '12345', tier: 'pro', status: 'cancelled' },
    )

    expect(calls).toEqual(['free'])
  })

  // --- Idempotency / duplicate-delivery resilience (webhook review) ---
  // Stripe delivers events at-least-once. wallet-tracker-pro dedupes via the
  // unique `chatId` (telegramSubscriber.upsert + setSubscriberTier update). The
  // same delivery replayed N times must converge to a single final state and
  // must not amplify side effects beyond idempotent writes.
  it('converges to a single state across repeated duplicate deliveries', async () => {
    const state = new Map<string, string>()
    const tierWrites: string[] = []

    const upsert = async (chatId: string) => {
      state.set(chatId, state.get(chatId) ?? 'free')
    }
    const setTier = async (chatId: string, tier: string) => {
      state.set(chatId, tier)
      tierWrites.push(tier)
    }

    const payload = { chatId: '12345', tier: 'pro' as const, status: 'active' as const }
    // Simulate Stripe retrying the SAME event 5 times.
    for (let i = 0; i < 5; i++) {
      await applySubscriberTierSync(upsert, setTier, payload)
    }

    expect(state.get('12345')).toBe('pro')
    // Five identical deliveries each re-run the idempotent writes, but the final
    // state is stable (no corruption / no double upgrade). The mock records every
    // write so a regression that e.g. double-applied a side effect would show up.
    expect(tierWrites).toEqual(['pro', 'pro', 'pro', 'pro', 'pro'])
  })

  it('documents last-write-wins for out-of-order completed-then-deleted', async () => {
    // Stripe can deliver checkout.session.completed AFTER
    // customer.subscription.deleted. Because the route dedupes on chatId (not on
    // the Stripe event id), the later arrival wins. This locks in the CURRENT
    // semantics so a future change to event-ordered processing is deliberate.
    const state = new Map<string, string>()
    const upsert = async (chatId: string) => {
      state.set(chatId, state.get(chatId) ?? 'free')
    }
    const setTier = async (chatId: string, tier: string) => {
      state.set(chatId, tier)
    }

    // deleted first (-> free), then completed (-> pro) arrives late.
    await applySubscriberTierSync(
      upsert,
      setTier,
      { chatId: '12345', tier: 'free', status: 'cancelled' },
    )
    await applySubscriberTierSync(
      upsert,
      setTier,
      { chatId: '12345', tier: 'pro', status: 'active' },
    )

    // Last arrival wins -> pro (the known last-write-wins behavior).
    expect(state.get('12345')).toBe('pro')
  })
})
