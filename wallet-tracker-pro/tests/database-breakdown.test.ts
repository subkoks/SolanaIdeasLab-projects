/**
 * @jest-environment node
 */
import { DatabaseService } from '../src/services/database'
import {
  createTestPrismaClient,
  describeIfTestDatabase,
} from './helpers/test-database'

describeIfTestDatabase('DatabaseService activity breakdown', () => {
  it('returns zero counts for wallets with no events', async () => {
    const database = new DatabaseService(createTestPrismaClient())
    await database.connect()

    try {
      const breakdown = await database.getActivityBreakdown(
        'Wallet1111111111111111111111111111111',
      )

      expect(breakdown).toEqual({
        total: 0,
        in: 0,
        out: 0,
        unknown: 0,
      })
    } finally {
      await database.disconnect()
    }
  })
})
