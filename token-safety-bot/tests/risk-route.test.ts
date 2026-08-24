import request from 'supertest'
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { TokenSafetyBot } from '../src/index'

// Routes are exercised over HTTP (supertest) so the real middleware + validation
// path runs. We only assert on the validation guard, which short-circuits before
// any scanner/Solana-RPC work — keeping the suite hermetic and offline.
// (Downstream scan behavior for well-formed addresses requires Solana RPC and is
// covered by unit tests elsewhere; it is intentionally not asserted here.)

describe('GET /api/v1/risk/:tokenAddress input validation', () => {
  let tmpDir: string
  let storePath: string

  beforeAll(async () => {
    const os = await import('node:os')
    const path = await import('node:path')
    const { mkdtemp } = await import('node:fs/promises')
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'tsb-risk-http-'))
    storePath = path.join(tmpDir, 'store.json')
    process.env.DATA_STORE_PATH = storePath
  })

  afterAll(async () => {
    const { rm } = await import('node:fs/promises')
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('rejects a non-base58 (too-long garbage) address with 400', async () => {
    const bot = new TokenSafetyBot()
    const app = bot.getApp()

    // 40 chars: passes zod min(32) but is not a valid base58 32-byte address,
    // so the route guard must reject it before any scan/RPC work.
    const res = await request(app).get('/api/v1/risk/' + 'x'.repeat(40))

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ error: 'Invalid Solana token address' })
  })

  it('rejects a too-short address with 400 (zod length gate)', async () => {
    const bot = new TokenSafetyBot()
    const app = bot.getApp()

    const res = await request(app).get('/api/v1/risk/' + 'short')

    expect(res.status).toBe(400)
  })
})
