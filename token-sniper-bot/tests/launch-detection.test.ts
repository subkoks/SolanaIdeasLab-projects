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

  it('ingests a launch from a webhook signature', async () => {
    const mockConnection = {
      getParsedTransaction: jest.fn().mockResolvedValue({
        meta: { postTokenBalances: [{ mint: 'mint-webhook' }] },
        transaction: {
          message: {
            accountKeys: [{ pubkey: { toBase58: () => 'creator-webhook' } }],
          },
        },
      }),
    }

    const service = new LaunchDetectionService(mockConnection as never)
    const launch = await service.ingestSignature('sig-webhook', 1_700_000_100)

    expect(launch).toEqual({
      mint: 'mint-webhook',
      signature: 'sig-webhook',
      creator: 'creator-webhook',
      timestampMs: 1_700_000_100_000,
    })

    await expect(service.ingestSignature('sig-webhook-2', 1_700_000_200)).resolves.toBeNull()
  })
})
