import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { SolanaService } from '../src/services/solana'
import { DatabaseService } from '../src/services/database'
import { SafetyScannerService } from '../src/services/safety-scanner'

const TEST_TOKEN = 'So11111111111111111111111111111111111111112'

const createSolanaStub = (): jest.Mocked<
  Pick<
    SolanaService,
    | 'getRecentSignatures'
    | 'getTokenHolderCount'
    | 'getTokenInfo'
    | 'getTokenLargestAccounts'
    | 'isValidAddress'
  >
> => ({
  isValidAddress: jest.fn().mockReturnValue(true),
  getTokenInfo: jest.fn().mockResolvedValue({
    address: TEST_TOKEN,
    decimals: 6,
    mintAuthority: undefined,
    freezeAuthority: undefined,
    supply: '1000000000',
    tokenProgram: 'token-2022',
  }),
  getTokenLargestAccounts: jest.fn().mockResolvedValue([
    {
      address: 'holder-1',
      amount: '300000000',
      uiAmount: 300,
    },
  ]),
  getRecentSignatures: jest
    .fn()
    .mockResolvedValue(Array.from({ length: 12 }, (_, index) => `sig-${index}`)),
  getTokenHolderCount: jest.fn().mockResolvedValue(8),
})

describe('SafetyScannerService', () => {
  it('applies blacklist override before RPC scanning', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'token-safety-scan-'))
    const storePath = path.join(tempDir, 'store.json')
    const databaseService = new DatabaseService(storePath)
    const solanaStub = createSolanaStub()
    const scanner = new SafetyScannerService(
      databaseService,
      solanaStub as unknown as SolanaService,
    )

    try {
      await databaseService.connect()
      await databaseService.blacklistToken(TEST_TOKEN, 'manual blacklist', {
        source: 'test',
      })

      const result = await scanner.scanToken(TEST_TOKEN, 'quick', 'user-1')

      expect(result.summary.blacklisted).toBe(true)
      expect(result.safetyLevel).toBe('dangerous')
      expect(result.overallScore).toBe(0)
      expect(solanaStub.getTokenInfo).not.toHaveBeenCalled()
    } finally {
      await databaseService.disconnect()
      await rm(tempDir, { force: true, recursive: true })
    }
  })

  it('uses raw token amounts for top-holder concentration scoring', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'token-safety-scan-'))
    const storePath = path.join(tempDir, 'store.json')
    const databaseService = new DatabaseService(storePath)
    const solanaStub = createSolanaStub()
    const scanner = new SafetyScannerService(
      databaseService,
      solanaStub as unknown as SolanaService,
    )

    try {
      await databaseService.connect()

      const result = await scanner.scanToken(TEST_TOKEN, 'quick')

      expect(result.summary.topHolderOwnershipRatio).toBeCloseTo(0.3, 4)
      expect(result.redFlags).toContain(
        'Top holder controls more than 25% of visible supply',
      )
      expect(result.redFlags).toContain(
        'Token uses Token-2022 extensions that require manual review',
      )
    } finally {
      await databaseService.disconnect()
      await rm(tempDir, { force: true, recursive: true })
    }
  })
})
