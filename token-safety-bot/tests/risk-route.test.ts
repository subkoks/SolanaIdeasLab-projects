import request from 'supertest'
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { TokenSafetyBot } from '../src/index'

// Routes are exercised over HTTP (supertest) so the real middleware + validation
// path runs. We only assert on the validation guard, which short-circuits before
// any scanner/Solana-RPC work — keeping the suite hermetic and offline.
// (Downstream scan behavior for well-formed addresses requires Solana RPC and is
// covered by unit tests elsewhere; it is intentionally not asserted here.)

const ROUTES = [
  '/api/v1/risk/',
  '/api/v1/scan/',
  '/api/v1/safety/score/',
  '/api/v1/safety/report/',
]

describe('address-taking GET routes reject malformed input', () => {
  let tmpDir: string
  let storePath: string

  beforeAll(async () => {
    const os = await import('node:os')
    const path = await import('node:path')
    const { mkdtemp } = await import('node:fs/promises')
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'tsb-addr-http-'))
    storePath = path.join(tmpDir, 'store.json')
    process.env.DATA_STORE_PATH = storePath
  })

  afterAll(async () => {
    const { rm } = await import('node:fs/promises')
    await rm(tmpDir, { recursive: true, force: true })
  })

  for (const route of ROUTES) {
    it(`rejects a non-base58 (garbage) address on ${route} with 400`, async () => {
      const bot = new TokenSafetyBot()
      const app = bot.getApp()

      // 40 chars: passes zod min(32) but is not a valid base58 32-byte address,
      // so the route guard must reject it before any scan/RPC work.
      const res = await request(app).get(route + 'x'.repeat(40))

      expect(res.status).toBe(400)
      expect(res.body).toMatchObject({ error: 'Invalid Solana token address' })
    })

    it(`rejects a too-short address on ${route} with 400`, async () => {
      const bot = new TokenSafetyBot()
      const app = bot.getApp()

      const res = await request(app).get(route + 'short')

      expect(res.status).toBe(400)
    })
  }
})

describe('address-taking POST bodies reject malformed input', () => {
  let tmpDir: string
  let storePath: string

  beforeAll(async () => {
    const os = await import('node:os')
    const path = await import('node:path')
    const { mkdtemp } = await import('node:fs/promises')
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'tsb-addr-post-'))
    storePath = path.join(tmpDir, 'store.json')
    process.env.DATA_STORE_PATH = storePath
  })

  afterAll(async () => {
    const { rm } = await import('node:fs/promises')
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('rejects a malformed programId on POST /safety/contract/analyze with 400', async () => {
    const bot = new TokenSafetyBot()
    const app = bot.getApp()
    const res = await request(app)
      .post('/api/v1/safety/contract/analyze')
      .send({ programId: 'x'.repeat(40), analysisType: 'security' })
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ error: 'Invalid Solana program ID' })
  })

  it('rejects a malformed tokenAddress on POST /safety/rug-pull/detect with 400', async () => {
    const bot = new TokenSafetyBot()
    const app = bot.getApp()
    const res = await request(app)
      .post('/api/v1/safety/rug-pull/detect')
      .send({ tokenAddress: 'x'.repeat(40), timeWindow: 3600 })
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ error: 'Invalid Solana token address' })
  })
})
