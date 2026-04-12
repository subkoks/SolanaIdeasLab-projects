import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseService } from '../src/services/database'
import type { SafetyScanResult } from '../src/services/safety-scanner'

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
      const firstInstance = new DatabaseService(storePath)
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

      const secondInstance = new DatabaseService(storePath)
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
})
