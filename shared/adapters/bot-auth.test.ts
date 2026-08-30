import { AuthUser } from '../auth/wallet-auth'
import { toBotUser } from '../adapters/bot-auth'

const baseUser: AuthUser = {
  id: 'wallet11111111111111111111111111111111',
  wallet: 'wallet11111111111111111111111111111111',
  publicKey: {} as any,
  subscriptionTier: 'pro',
  createdAt: new Date(),
  lastActive: new Date(),
}

describe('toBotUser adapter', () => {
  it('maps shared AuthUser to bot AuthenticatedUser shape', () => {
    const bot = toBotUser(baseUser)
    expect(bot).toEqual({
      id: baseUser.id,
      walletAddress: baseUser.wallet,
      subscriptionTier: 'pro',
    })
  })

  it('preserves the wallet address as walletAddress', () => {
    const bot = toBotUser({ ...baseUser, wallet: 'So1anaAddressXXXXXXXXXXXXXXXXXXXXXXXXXXXY', id: 'So1anaAddressXXXXXXXXXXXXXXXXXXXXXXXXXXXY' })
    expect(bot.walletAddress).toBe('So1anaAddressXXXXXXXXXXXXXXXXXXXXXXXXXXXY')
  })

  it('carries the subscription tier through', () => {
    expect(toBotUser({ ...baseUser, subscriptionTier: 'free' }).subscriptionTier).toBe('free')
    expect(toBotUser({ ...baseUser, subscriptionTier: 'enterprise' }).subscriptionTier).toBe('enterprise')
  })
})
