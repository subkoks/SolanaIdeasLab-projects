import express from 'express'
import request from 'supertest'
import { ApiMiddleware, AuthenticatedRequest } from "../api/middleware"
import { WalletAuth, AuthUser } from "../auth/wallet-auth"
import { Keypair } from '@solana/web3.js'

const TEST_SECRET = 'test-jwt-secret-at-least-16-characters'

function appFor(auth: WalletAuth): express.Express {
  const app = express()
  // codeql[js/missing-rate-limiting]: test-only Express route used by the
  // supertest integration suite; it has no real traffic. Production routes apply
  // ApiMiddleware.rateLimitMiddleware / express-rate-limit.
  app.get(
    '/protected',
    ApiMiddleware.rateLimitMiddleware(100, 60_000),
    ApiMiddleware.authMiddleware((t: string) => auth.verifyToken(t)),
    (req: AuthenticatedRequest, res) => {
      res.json({ ok: true, wallet: req.user?.wallet })
    },
  )
  return app
}

describe('Shared auth middleware — Express integration (supertest)', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const auth = new WalletAuth({} as any, TEST_SECRET)
    const app = appFor(auth)
    const res = await request(app).get('/protected')
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('accepts a valid token and reaches the protected handler', async () => {
    const auth = new WalletAuth({} as any, TEST_SECRET)
    const app = appFor(auth)
    const kp = Keypair.generate()
    const user: AuthUser = {
      id: kp.publicKey.toBase58(),
      wallet: kp.publicKey.toBase58(),
      publicKey: kp.publicKey,
      subscriptionTier: 'pro',
      createdAt: new Date(),
      lastActive: new Date(),
    }
    const token = auth.createJWT(user)
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.wallet).toBe(user.wallet)
  })

  it('rejects a garbage token with 401', async () => {
    const auth = new WalletAuth({} as any, TEST_SECRET)
    const app = appFor(auth)
    const res = await request(app).get('/protected').set('Authorization', 'Bearer garbage.token.value')
    expect(res.status).toBe(401)
  })
})
