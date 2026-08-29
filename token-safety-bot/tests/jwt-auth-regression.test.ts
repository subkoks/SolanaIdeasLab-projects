import type { Response } from 'express'
import type { AuthenticatedRequest } from '../src/types/auth'

const originalEnv = process.env

const createResponse = (): Response =>
  ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }) as unknown as Response

describe('existing JWT auth flow — no regression', () => {
  afterEach(() => {
    process.env = { ...originalEnv }
    jest.resetModules()
  })

  it('keeps the existing token claim names and user payload shape', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      SKIP_AUTH_IN_DEV: 'false',
      JWT_SECRET: 'regression-test-secret',
    }
    jest.resetModules()
    const jwt = require('jsonwebtoken')
    const { authMiddleware } =
      require('../src/middleware/auth') as typeof import('../src/middleware/auth')

    // The exact claim shape the bot has always issued — must remain unchanged.
    const token = jwt.sign(
      {
        userId: 'user-xyz',
        walletAddress: 'WalletXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        subscriptionTier: 'pro',
      },
      'regression-test-secret',
      { expiresIn: '1h' },
    )

    const request = {
      headers: { authorization: `Bearer ${token}` },
    } as AuthenticatedRequest
    const response = createResponse()
    const next = jest.fn()

    authMiddleware(request, response, next)

    expect(next).toHaveBeenCalledTimes(1)
    // Payload shape is preserved exactly (id/walletAddress/subscriptionTier).
    expect(request.user).toEqual({
      id: 'user-xyz',
      walletAddress: 'WalletXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      subscriptionTier: 'pro',
    })
    expect(response.status).not.toHaveBeenCalled()
  })

  it('still rejects an expired JWT (expiry check intact)', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      SKIP_AUTH_IN_DEV: 'false',
      JWT_SECRET: 'regression-test-secret',
    }
    jest.resetModules()
    const jwt = require('jsonwebtoken')
    const { authMiddleware } =
      require('../src/middleware/auth') as typeof import('../src/middleware/auth')

    const token = jwt.sign(
      { userId: 'u', walletAddress: 'w', subscriptionTier: 'free' },
      'regression-test-secret',
      { expiresIn: '-1s' },
    )

    const request = {
      headers: { authorization: `Bearer ${token}` },
    } as AuthenticatedRequest
    const response = createResponse()
    const next = jest.fn()

    authMiddleware(request, response, next)

    expect(next).not.toHaveBeenCalled()
    expect(response.status).toHaveBeenCalledWith(401)
  })
})
