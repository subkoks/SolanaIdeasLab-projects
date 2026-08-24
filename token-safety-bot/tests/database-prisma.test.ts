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

  it('claims Stripe webhook events idempotently and releases on retry', async () => {
    const database = new PrismaDatabaseService()
    await database.connect()

    const eventId = `evt_prisma_${Date.now()}`
    try {
      expect(await database.claimStripeWebhookEvent(eventId, 'x')).toBe(true)
      // Duplicate claim (already processing) must be rejected.
      expect(await database.claimStripeWebhookEvent(eventId, 'x')).toBe(false)
      // Re-claiming a processed event must also be rejected.
      await database.markStripeWebhookEventProcessed(eventId)
      expect(await database.claimStripeWebhookEvent(eventId, 'x')).toBe(false)

      // Release a fresh in-flight event so Stripe can retry it.
      const retryId = `evt_prisma_retry_${Date.now()}`
      expect(await database.claimStripeWebhookEvent(retryId, 'x')).toBe(true)
      await database.releaseStripeWebhookEvent(retryId)
      expect(await database.claimStripeWebhookEvent(retryId, 'x')).toBe(true)
      await database.markStripeWebhookEventProcessed(retryId)
    } finally {
      await database.disconnect()
    }
  })
})
