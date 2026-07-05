import { config } from '../src/config/environment'
import {
  generateRefreshToken,
  generateToken,
  verifyRefreshToken,
} from '../src/middleware/auth'
import jwt from 'jsonwebtoken'

describe('auth tokens', () => {
  const user = {
    id: 'user-1',
    walletAddress: 'So11111111111111111111111111111111111111112',
    subscriptionTier: 'pro',
  }

  it('issues access tokens that verify with jwt.verify', () => {
    const token = generateToken(user)
    const decoded = jwt.verify(token, config.jwt.secret) as {
      userId: string
      walletAddress: string
      subscriptionTier: string
    }

    expect(decoded.userId).toBe(user.id)
    expect(decoded.walletAddress).toBe(user.walletAddress)
    expect(decoded.subscriptionTier).toBe(user.subscriptionTier)
  })

  it('issues refresh tokens that round-trip through verifyRefreshToken', () => {
    const refreshToken = generateRefreshToken(user.id)
    expect(verifyRefreshToken(refreshToken)).toEqual({ userId: user.id })
  })
})
