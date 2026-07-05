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
})
