import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { JsonDatabaseService } from '../src/services/database'
import type { SafetyScanResult } from '../src/services/safety-scanner'
import { ScanLimitExceededError } from '../src/utils/subscription-limits'

const TEST_TOKEN = 'So11111111111111111111111111111111111111112'

const buildScanResult = (tokenAddress: string): SafetyScanResult => ({
  analysisDepth: 'quick',
  tokenAddress,
  scannedAt: new Date().toISOString(),
  scanTime: 42,
  overallScore: 65,
  safetyLevel: 'watch',
  redFlags: ['Holder count is still thin'],
  greenFlags: ['Mint authority appears revoked'],
  recommendations: ['Wait for more trading history before increasing position size'],
  summary: {
    blacklisted: false,
    contractAuthoritiesPresent: [],
    holderCount: 8,
    recentActivityCount: 10,
    tokenProgram: 'spl-token',
    topHolderOwnershipRatio: 0.12,
  },
})

describe('DatabaseService persistence', () => {
  it('persists users, scans, alerts, and blacklist entries across reconnects', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'token-safety-db-'))
    const storePath = path.join(tempDir, 'store.json')

    try {
      const firstInstance = new JsonDatabaseService(storePath)
      await firstInstance.connect()

      const auth = await firstInstance.authenticateWallet('wallet-A', 'sig-A')
      await firstInstance.createAlert(auth.user.id, {
        alertType: 'rug-pull',
        tokenAddress: TEST_TOKEN,
      })
      await firstInstance.blacklistToken(TEST_TOKEN, 'Known scam token', {
        source: 'unit-test',
      })
      await firstInstance.saveScan(TEST_TOKEN, buildScanResult(TEST_TOKEN), auth.user.id)
      await firstInstance.disconnect()

      const secondInstance = new JsonDatabaseService(storePath)
      await secondInstance.connect()

      const users = await secondInstance.getUserStats()
      const alerts = await secondInstance.getUserAlerts(auth.user.id)
      const latestScan = await secondInstance.getLatestScan(TEST_TOKEN)
      const blacklistedRecord = await secondInstance.getBlacklistedToken(TEST_TOKEN)

      expect(users.total).toBe(1)
      expect(alerts).toHaveLength(1)
      expect(latestScan?.tokenAddress).toBe(TEST_TOKEN)
      expect(blacklistedRecord?.reason).toBe('Known scam token')

      await secondInstance.disconnect()
    } finally {
      await rm(tempDir, { force: true, recursive: true })
    }
  })

  it('enforces the free-tier scan limit at write time', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'token-safety-db-'))
    const storePath = path.join(tempDir, 'store.json')

    try {
      const database = new JsonDatabaseService(storePath)
      await database.connect()
      const auth = await database.authenticateWallet('wallet-limit', 'sig')

      for (let index = 0; index < 10; index += 1) {
        await database.saveScan(
          `${TEST_TOKEN}-${index}`,
          buildScanResult(TEST_TOKEN),
          auth.user.id,
        )
      }

      await expect(
        database.saveScan(TEST_TOKEN, buildScanResult(TEST_TOKEN), auth.user.id),
      ).rejects.toBeInstanceOf(ScanLimitExceededError)

      await database.disconnect()
    } finally {
      await rm(tempDir, { force: true, recursive: true })
    }
  })

  it('persists Stripe webhook claims and rejects replays', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'token-safety-events-'))
    const storePath = path.join(tempDir, 'store.json')
    const firstInstance = new JsonDatabaseService(storePath)
    const secondInstance = new JsonDatabaseService(storePath)

    try {
      await firstInstance.connect()
      expect(
        await firstInstance.claimStripeWebhookEvent(
          'evt_123',
          'checkout.session.completed',
        ),
      ).toBe(true)
      await firstInstance.markStripeWebhookEventProcessed('evt_123')
      await firstInstance.disconnect()

      await secondInstance.connect()
      expect(
        await secondInstance.claimStripeWebhookEvent(
          'evt_123',
          'checkout.session.completed',
        ),
      ).toBe(false)
    } finally {
      await secondInstance.disconnect()
      await rm(tempDir, { force: true, recursive: true })
    }
  })

  it('rejects a duplicate claim while still processing (no double-sync)', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'token-safety-dup-'))
    const storePath = path.join(tempDir, 'store.json')
    const database = new JsonDatabaseService(storePath)

    try {
      await database.connect()
      expect(await database.claimStripeWebhookEvent('evt_dup', 'x')).toBe(true)
      // Still "processing" -> second attempt must be rejected.
      expect(await database.claimStripeWebhookEvent('evt_dup', 'x')).toBe(false)
      await database.markStripeWebhookEventProcessed('evt_dup')
      await database.disconnect()
    } finally {
      await rm(tempDir, { force: true, recursive: true })
    }
  })

  it('releases a failed claim so Stripe can retry', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'token-safety-rel-'))
    const storePath = path.join(tempDir, 'store.json')
    const database = new JsonDatabaseService(storePath)

    try {
      await database.connect()
      expect(await database.claimStripeWebhookEvent('evt_retry', 'x')).toBe(true)
      // Simulate handler error path -> release for retry.
      await database.releaseStripeWebhookEvent('evt_retry')
      // After release the same event id can be claimed again (retry succeeds).
      expect(await database.claimStripeWebhookEvent('evt_retry', 'x')).toBe(true)
      await database.markStripeWebhookEventProcessed('evt_retry')
      await database.disconnect()
    } finally {
      await rm(tempDir, { force: true, recursive: true })
    }
  })

  it('does not reclaim a processing event within the claim timeout', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'token-safety-timeout-'))
    const storePath = path.join(tempDir, 'store.json')
    const database = new JsonDatabaseService(storePath)

    try {
      await database.connect()
      expect(await database.claimStripeWebhookEvent('evt_fresh', 'x')).toBe(true)
      const reclaimed = await database.claimStripeWebhookEvent('evt_fresh', 'x')
      expect(reclaimed).toBe(false)
      await database.releaseStripeWebhookEvent('evt_fresh')
      await database.disconnect()
    } finally {
      await rm(tempDir, { force: true, recursive: true })
    }
  })

  it('rejects invalid Stripe event ids', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'token-safety-invalid-'))
    const storePath = path.join(tempDir, 'store.json')
    const database = new JsonDatabaseService(storePath)

    try {
      await database.connect()
      await expect(database.claimStripeWebhookEvent('   ', 'x')).rejects.toThrow(
        'Invalid Stripe event ID',
      )
      const tooLong = 'x'.repeat(256)
      await expect(
        database.claimStripeWebhookEvent(tooLong, 'x'),
      ).rejects.toThrow('Invalid Stripe event ID')
      await database.disconnect()
    } finally {
      await rm(tempDir, { force: true, recursive: true })
    }
  })
})
