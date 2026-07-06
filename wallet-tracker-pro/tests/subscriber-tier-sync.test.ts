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
})
