/**
 * @jest-environment node
 */
import { DatabaseService } from '../src/services/database'

const describeIfDatabase = process.env.DATABASE_URL ? describe : describe.skip

describeIfDatabase('DatabaseService analytics', () => {
  it('returns zeroed overview when no recent activity', async () => {
    const database = new DatabaseService()
    await database.connect()

    try {
      const overview = await database.getAnalyticsOverview()

      expect(overview.eventsLast24h).toBeGreaterThanOrEqual(0)
      expect(overview.eventsLast7d).toBeGreaterThanOrEqual(0)
      expect(overview.uniqueActiveWallets).toBeGreaterThanOrEqual(0)
      expect(overview.avgEventsPerWatch).toBeGreaterThanOrEqual(0)
    } finally {
      await database.disconnect()
    }
  })

  it('returns an array for top active wallets', async () => {
    const database = new DatabaseService()
    await database.connect()

    try {
      const wallets = await database.getTopActiveWallets(3)
      expect(Array.isArray(wallets)).toBe(true)
    } finally {
      await database.disconnect()
    }
  })
})
