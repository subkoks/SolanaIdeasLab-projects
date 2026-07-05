/**
 * @jest-environment node
 */
jest.mock('@solana/web3.js', () => {
  class PublicKey {
    constructor(value: string) {
      if (!value || value.includes('not-a-wallet')) {
        throw new Error('Invalid public key input')
      }
    }
  }

  return {
    PublicKey,
    Connection: jest.fn(),
  }
})

jest.mock('../src/lib/config', () => ({
  config: {
    solana: { rpcUrl: 'http://localhost', commitment: 'confirmed' },
    watcher: { signatureBatchSize: 10 },
  },
}))

jest.mock('../src/lib/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}))

import { SolanaWatcherService } from '../src/services/solana-watcher'

describe('SolanaWatcherService', () => {
  const watcher = new SolanaWatcherService()

  it('accepts valid Solana addresses', () => {
    expect(
      watcher.isValidAddress('11111111111111111111111111111112'),
    ).toBe(true)
  })

  it('rejects invalid addresses', () => {
    expect(watcher.isValidAddress('not-a-wallet')).toBe(false)
    expect(watcher.isValidAddress('')).toBe(false)
  })

  it('parses SPL token balance changes for the watched wallet', () => {
    const movements = watcher.parseMovements(
      'Wallet1111111111111111111111111111111',
      'sig123',
      {
        meta: {
          preBalances: [],
          postBalances: [],
          preTokenBalances: [
            {
              mint: 'Mint1111111111111111111111111111111111',
              owner: 'Wallet1111111111111111111111111111111',
              uiTokenAmount: { amount: '1000000', decimals: 6, uiAmount: 1 },
            },
          ],
          postTokenBalances: [
            {
              mint: 'Mint1111111111111111111111111111111111',
              owner: 'Wallet1111111111111111111111111111111',
              uiTokenAmount: { amount: '2500000', decimals: 6, uiAmount: 2.5 },
            },
          ],
        },
        transaction: {
          message: {
            accountKeys: [],
          },
        },
      } as never,
    )

    expect(movements).toHaveLength(1)
    expect(movements[0]?.tokenMint).toBe(
      'Mint1111111111111111111111111111111111',
    )
    expect(movements[0]?.direction).toBe('in')
    expect(movements[0]?.summary).toContain('SPL in')
  })
})
