import { Request, Response } from 'express'
import { ApiMiddleware, AuthenticatedRequest, createApiResponse } from '../api/middleware'
import { WalletAuth, AuthUser } from '../auth/wallet-auth'
import { Keypair } from '@solana/web3.js'

const TEST_SECRET = 'test-jwt-secret-at-least-16-characters'

function mockReqRes(headers: Record<string, string> = {}, ip = '1.2.3.4') {
  const req: any = {
    headers,
    ip,
  }
  const res: any = {
    statusCode: 0,
    body: undefined as any,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: any) {
      this.body = payload
      return this
    },
  }
  return { req: req as Request, res: res as Response, next: jest.fn() }
}

function makeUser(tier: AuthUser['subscriptionTier'] = 'free'): AuthUser {
  const kp = Keypair.generate()
  return {
    id: kp.publicKey.toBase58(),
    wallet: kp.publicKey.toBase58(),
    publicKey: kp.publicKey,
    subscriptionTier: tier,
    createdAt: new Date(),
    lastActive: new Date(),
  }
}

describe('ApiMiddleware.authMiddleware', () => {
  const auth = new WalletAuth({} as any, TEST_SECRET)

  it('returns 401 when no Authorization header', async () => {
    const { req, res, next } = mockReqRes({})
    const mw = ApiMiddleware.authMiddleware((t) => auth.verifyToken(t))
    await mw(req as AuthenticatedRequest, res, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when token is invalid', async () => {
    const { req, res, next } = mockReqRes({ authorization: 'Bearer not-a-real-token' })
    const mw = ApiMiddleware.authMiddleware((t) => auth.verifyToken(t))
    await mw(req as AuthenticatedRequest, res, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next and sets req.user for a valid token', async () => {
    const user = makeUser('pro')
    const token = auth.createJWT(user)
    const { req, res, next } = mockReqRes({ authorization: `Bearer ${token}` })
    const mw = ApiMiddleware.authMiddleware((t) => auth.verifyToken(t))
    await mw(req as AuthenticatedRequest, res, next)
    expect(res.statusCode).toBe(0)
    expect(next).toHaveBeenCalled()
    expect((req as AuthenticatedRequest).user?.wallet).toBe(user.wallet)
  })
})

describe('ApiMiddleware.subscriptionMiddleware', () => {
  it('allows when user tier meets requirement', () => {
    const user = makeUser('pro')
    const { req, res, next } = mockReqRes({})
    ;(req as AuthenticatedRequest).user = user
    ApiMiddleware.subscriptionMiddleware('basic')(req as AuthenticatedRequest, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('returns 403 when user tier is below requirement', () => {
    const user = makeUser('free')
    const { req, res, next } = mockReqRes({})
    ;(req as AuthenticatedRequest).user = user
    ApiMiddleware.subscriptionMiddleware('pro')(req as AuthenticatedRequest, res, next)
    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when no user present', () => {
    const { req, res, next } = mockReqRes({})
    ApiMiddleware.subscriptionMiddleware('pro')(req as AuthenticatedRequest, res, next)
    expect(res.statusCode).toBe(401)
  })
})

describe('ApiMiddleware.rateLimitMiddleware', () => {
  it('allows up to maxRequests then returns 429', () => {
    const mw = ApiMiddleware.rateLimitMiddleware(2, 10000)
    const a = mockReqRes({}, '9.9.9.9')
    const b = mockReqRes({}, '9.9.9.9')
    const c = mockReqRes({}, '9.9.9.9')
    mw(a.req, a.res, a.next)
    mw(b.req, b.res, b.next)
    mw(c.req, c.res, c.next)
    expect(a.next).toHaveBeenCalled()
    expect(b.next).toHaveBeenCalled()
    expect(c.res.statusCode).toBe(429)
  })
})

describe('createApiResponse', () => {
  it('wraps payloads with a timestamp', () => {
    const r = createApiResponse(true, { ok: 1 })
    expect(r.success).toBe(true)
    expect(r.data).toEqual({ ok: 1 })
    expect(typeof r.timestamp).toBe('string')
  })
})
