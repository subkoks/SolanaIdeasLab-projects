/**
 * @jest-environment node
 */
import { PrismaDatabaseService } from '../src/services/database-prisma'

const describeIfDatabase = process.env.DATABASE_URL ? describe : describe.skip

describeIfDatabase('PrismaDatabaseService', () => {
  it('persists scans and blacklist entries in Postgres', async () => {
    const database = new PrismaDatabaseService()
    await database.connect()

    try {
      const auth = await database.authenticateWallet(
        'Wallet1111111111111111111111111111111',
        'sig',
      )

      await database.blacklistToken(
        'Mint1111111111111111111111111111111111',
        'integration test',
        { source: 'test' },
      )

      await database.saveScan(
        'Mint1111111111111111111111111111111111',
        {
          analysisDepth: 'quick',
          tokenAddress: 'Mint1111111111111111111111111111111111',
          scannedAt: new Date().toISOString(),
          scanTime: 10,
          overallScore: 55,
          safetyLevel: 'watch',
          redFlags: [],
          greenFlags: [],
          recommendations: [],
          summary: {
            blacklisted: false,
            contractAuthoritiesPresent: [],
            holderCount: 5,
            recentActivityCount: 2,
            tokenProgram: 'spl-token',
            topHolderOwnershipRatio: 0.1,
          },
        },
        auth.user.id,
      )

      const latest = await database.getLatestScan(
        'Mint1111111111111111111111111111111111',
      )
      const blacklisted = await database.getBlacklistedToken(
        'Mint1111111111111111111111111111111111',
      )

      expect(latest?.overallScore).toBe(55)
      expect(blacklisted?.reason).toBe('integration test')
    } finally {
      await database.disconnect()
    }
  })
})
