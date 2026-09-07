import express from 'express'
import request from 'supertest'
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, jest } from '@jest/globals'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

jest.mock('../src/services/database', () => ({ DatabaseService: class {} }))
jest.mock('../src/services/helius', () => ({ HeliusService: class {} }))
jest.mock('../src/services/helius-laserstream', () => ({ HeliusLaserStreamService: class {} }))
jest.mock('../src/services/monitor', () => ({ MonitorService: class {} }))
jest.mock('../src/services/queue', () => ({ QueueService: class {} }))
jest.mock('../src/services/risk-scoring', () => ({ RiskScoringService: class {} }))
jest.mock('../src/services/telegram-bot', () => ({ TelegramBotService: class {} }))

import { TokenSniperBot } from '../src/index'

const withProductionEnv = async <T,>(fn: () => Promise<T>): Promise<T> => {
  const orig = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try { return await fn() } finally {
    if (orig === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = orig
  }
}

describe('demo dashboard routes', () => {
  let app: express.Express
  beforeAll(() => {
    const bot = new TokenSniperBot()
    app = (bot as unknown as { app: express.Application }).app
  })

  let origNodeEnv: string | undefined
  beforeEach(() => { origNodeEnv = process.env.NODE_ENV; if (!origNodeEnv) process.env.NODE_ENV = 'test' })
  afterEach(() => { if (origNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = origNodeEnv })

  it('GET /demo returns HTML identifying the bot and demo', async () => {
    const r = await request(app).get('/demo')
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toMatch(/html/)
    expect(r.text).toMatch(/Token Sniper Bot/)
    expect(r.text).toMatch(/Local Fixture Alert Demo/)
  })
  it('HTML contains local-only / simulated / no-live disclaimer', async () => {
    const r = await request(app).get('/demo')
    expect(r.text).toMatch(/LOCAL ONLY/i)
    expect(r.text).toMatch(/SIMULATED/i)
    expect(r.text).toMatch(/NO LIVE MONITORING/i)
    expect(r.text).toMatch(/No live monitoring/i)
  })
  it('HTML contains no external assets / CDNs / http(s)://', async () => {
    const r = await request(app).get('/demo')
    expect(r.text).not.toMatch(/https?:\/\//)
    expect(r.text).not.toMatch(/cdn\./i)
    expect(r.text).not.toMatch(/google.*font/i)
    expect(r.text).not.toMatch(/analytics/i)
  })
  it('GET /demo.css returns 200 with substantive content', async () => {
    const r = await request(app).get('/demo.css')
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toMatch(/css/)
    expect(r.text.length).toBeGreaterThan(200)
  })
  it('GET /demo.js returns 200', async () => {
    const r = await request(app).get('/demo.js')
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toMatch(/javascript/)
  })

  describe('demo.js content', () => {
    let source: string
    beforeAll(() => {
      source = readFileSync(join(process.cwd(), 'public', 'demo.js'), 'utf8')
    })
    it('contains only the three allowed fixture IDs', () => {
      expect(source).toMatch(/'watch-launch'/)
      expect(source).toMatch(/'review-launch'/)
      expect(source).toMatch(/'suppress-launch'/)
      expect(source).toMatch(/ALLOWED/)
    })
    it('contains expected relative API path', () => {
      expect(source).toMatch(/'\/api\/v1\/demo\/alerts'/)
    })
    it('forbids web3 / wallet / signing / storage / external protocols', () => {
      for (const needle of ['@solana/web3','wallet','Transaction','Keypair','sendTransaction','WebSocket','EventSource','localStorage','http://','https://']) {
        expect(source).not.toMatch(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
      }
    })
    it('forbids trading language in source', () => {
      const bad = ['buy','sell','execute','snipe','trade','swap','transact','sign','send','purchase','profit','guaranteed']
      for (const w of bad) {
        // word-boundary, case-insensitive, not inside strings/comments — but spec just forbids presence
        const re = new RegExp(`\\b${w}\\b`, 'i')
        expect(source).not.toMatch(re)
      }
    })
  })

  describe('production concealment', () => {
    const assertGeneric404 = (r: request.Response): void => {
      expect(r.status).toBe(404)
      expect(r.body).toEqual({ error: 'Not found' })
      const blob = JSON.stringify(r.body) + (r.text ?? '')
      for (const leak of ['demo','fixture','watch-launch','review-launch','suppress-launch','source','isSimulated','signals']) {
        expect(blob).not.toMatch(new RegExp(leak, 'i'))
      }
      expect(blob).not.toMatch(/at .*\.ts:/) // no stack
      expect(blob).not.toMatch(/node_modules/)
    }
    it('GET /demo → 404 generic in production', async () => {
      await withProductionEnv(async () => {
        const r = await request(app).get('/demo')
        assertGeneric404(r)
      })
    })
    it('GET /demo.css → 404 generic in production', async () => {
      await withProductionEnv(async () => {
        const r = await request(app).get('/demo.css')
        assertGeneric404(r)
      })
    })
    it('GET /demo.js → 404 generic in production', async () => {
      await withProductionEnv(async () => {
        const r = await request(app).get('/demo.js')
        assertGeneric404(r)
      })
    })
  })
})
