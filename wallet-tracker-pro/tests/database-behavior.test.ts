/**
 * @jest-environment node
 */
import { DatabaseService } from '../src/services/database'

const describeIfDatabase = process.env.DATABASE_URL ? describe : describe.skip

describeIfDatabase('DatabaseService wallet behavior', () => {
  it('returns zeroed behavior summary for unknown wallets', async () => {
    const database = new DatabaseService()
    await database.connect()

    try {
      const behavior = await database.getWalletBehaviorSummary(
        'Wallet2222222222222222222222222222222',
      )

      expect(behavior.totalEvents).toBe(0)
      expect(behavior.inCount).toBe(0)
      expect(behavior.outCount).toBe(0)
      expect(behavior.netLamports).toBe('0')
    } finally {
      await database.disconnect()
    }
  })

  it('returns empty token mint breakdown for unknown wallets', async () => {
    const database = new DatabaseService()
    await database.connect()

    try {
      const breakdown = await database.getTokenMintBreakdown(
        'Wallet2222222222222222222222222222222',
      )
      expect(breakdown).toEqual([])
    } finally {
      await database.disconnect()
    }
  })
})
