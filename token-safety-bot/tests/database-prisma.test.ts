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
      // Valid base58 (32-byte) addresses so isValidWalletAddress passes.
      const wallet = 'kDVTwmUSuE1TtywrFnmjoJLaYHW77zT7CEuopwpTN7M'
      const mint = '3qheuHCnn9S2nhjgNWuFkwDz9Tojz6GsRquFccLPch2r'

      const auth = await database.authenticateWallet(wallet, 'sig')

      await database.blacklistToken(mint, 'integration test', { source: 'test' })

      await database.saveScan(
        mint,
        {
          analysisDepth: 'quick',
          tokenAddress: mint,
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

      const latest = await database.getLatestScan(mint)
      const blacklisted = await database.getBlacklistedToken(mint)

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
