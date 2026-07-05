jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn(),
  PublicKey: jest.fn().mockImplementation((value: string) => ({
    toBase58: () => value,
  })),
}))

import { LaunchDetectionService } from '../src/services/launch-detection'

describe('LaunchDetectionService bootstrap', () => {
  it('returns no launches on first poll while seeding cursor', async () => {
    const mockConnection = {
      getSignaturesForAddress: jest.fn().mockResolvedValue([
        {
          signature: 'sig-1',
          blockTime: 1_700_000_000,
        },
      ]),
      getParsedTransaction: jest.fn().mockResolvedValue({
        meta: { postTokenBalances: [{ mint: 'mint-1' }] },
        transaction: {
          message: {
            accountKeys: [{ pubkey: { toBase58: () => 'creator-1' } }],
          },
        },
      }),
    }

    const service = new LaunchDetectionService(mockConnection as never)

    await expect(service.pollPumpFunLaunches()).resolves.toEqual([])
    expect(mockConnection.getSignaturesForAddress).toHaveBeenCalledTimes(1)
  })
})
