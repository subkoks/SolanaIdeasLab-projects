import type { DeliveryWatch, DeliveryStore } from '../../src/services/wallet-delivery-ledger'
import type { WalletMovement } from '../../src/services/solana-watcher'

// Independent encoder for synthetic, canonical fixed-width public identifiers.
export const fixtureBase58 = (value: number, width: number): string => {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let remaining = value
  let encoded = ''
  let bytes = 0
  for (let integer = value; integer > 0; integer = Math.floor(integer / 256)) bytes++
  while (remaining > 0) {
    encoded = alphabet[remaining % 58] + encoded
    remaining = Math.floor(remaining / 58)
  }
  return '1'.repeat(width - bytes) + encoded
}

export const wallet = fixtureBase58(1, 32)
export const signature = fixtureBase58(1, 64)
export const movement = (overrides: Partial<WalletMovement> = {}): WalletMovement => ({
  signature, direction: 'in', lamports: BigInt(12), summary: 'Synthetic SOL in', ...overrides,
})
export const watch = (overrides: Partial<DeliveryWatch> = {}): DeliveryWatch => ({
  id: 'watch-1', walletAddress: wallet, lastSignature: null, revision: 0, label: 'Fixture',
  subscriber: { id: 'subscriber-1', chatId: '101' }, ...overrides,
})

export const deliveryStore = () => ({
  listPendingIds: jest.fn().mockResolvedValue(['delivery-1']),
  claim: jest.fn().mockResolvedValue({ id: 'delivery-1', claimToken: 'claim-1', chatId: '101', message: 'Synthetic snapshot' }),
  isClaimCurrent: jest.fn().mockResolvedValue(true),
  markSent: jest.fn().mockResolvedValue(true),
  markUncertain: jest.fn().mockResolvedValue(undefined),
  markRateLimited: jest.fn().mockResolvedValue(undefined),
  recoverInterruptedClaims: jest.fn().mockResolvedValue(undefined),
}) satisfies DeliveryStore
