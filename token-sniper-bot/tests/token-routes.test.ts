import express from 'express'
import request from 'supertest'
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals'

// The unauthenticated token routes (/score, /bundles) take a token address path
// param. We assert the isValidWalletAddress guard rejects malformed input with
// 400 before any risk-scorer / bundle-detection work.
//
// The bot constructor imports service modules, one of which (helius) pulls in
// @solana/web3.js (and its ESM transitive deps that jest cannot transform). We
// replace the service modules with explicit factory mocks so jest never loads
// the real implementations (and thus never loads web3). The address guard in
// src/index.ts is NOT mocked, so it is genuinely exercised. The mocked
// risk-scorer methods are never reached on the invalid-input path we assert.

jest.mock('../src/services/database', () => ({ DatabaseService: class {} }))
jest.mock('../src/services/helius', () => ({ HeliusService: class {} }))
jest.mock('../src/services/helius-laserstream', () => ({
  HeliusLaserStreamService: class {},
}))
jest.mock('../src/services/monitor', () => ({ MonitorService: class {} }))
jest.mock('../src/services/queue', () => ({ QueueService: class {} }))
jest.mock('../src/services/risk-scoring', () => ({
  RiskScoringService: class {},
}))
jest.mock('../src/services/telegram-bot', () => ({
  TelegramBotService: class {},
}))

// eslint-disable-next-line import/first
import { TokenSniperBot } from '../src/index'

describe('token GET routes reject malformed addresses', () => {
  let app: express.Express
  let tmpDir: string
  let storePath: string

  beforeAll(async () => {
    const os = await import('node:os')
    const path = await import('node:path')
    const { mkdtemp } = await import('node:fs/promises')
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'tsn-routes-http-'))
    storePath = path.join(tmpDir, 'store.json')
    process.env.DATA_STORE_PATH = storePath

    const bot = new TokenSniperBot()
    const router = (bot as unknown as { tokenRoutes: () => express.Router })
      .tokenRoutes()
    app = express()
    app.use(router)
  })

  afterAll(async () => {
    const { rm } = await import('node:fs/promises')
    await rm(tmpDir, { recursive: true, force: true })
  })

  for (const route of ['/score', '/bundles'] as const) {
    it(`rejects a non-base58 (garbage) address on ${route} with 400`, async () => {
      const res = await request(app).get('/' + 'x'.repeat(40) + route)
      expect(res.status).toBe(400)
      expect(res.body).toMatchObject({ error: 'Invalid Solana token address' })
    })

    it(`rejects a too-short address on ${route} with 400`, async () => {
      const res = await request(app).get('/short' + route)
      expect(res.status).toBe(400)
    })
  }
})
