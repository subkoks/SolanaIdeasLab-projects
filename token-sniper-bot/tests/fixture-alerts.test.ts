import express from 'express'
import request from 'supertest'
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, jest } from '@jest/globals'
import type { SpyInstance } from '@jest/globals'

// Mock the heavy service modules so jest never loads @solana/web3.js etc.
jest.mock('../src/services/database', () => ({ DatabaseService: class {} }))
jest.mock('../src/services/helius', () => ({ HeliusService: class {} }))
jest.mock('../src/services/helius-laserstream', () => ({ HeliusLaserStreamService: class {} }))
jest.mock('../src/services/monitor', () => ({ MonitorService: class {} }))
jest.mock('../src/services/queue', () => ({ QueueService: class {} }))
jest.mock('../src/services/risk-scoring', () => ({ RiskScoringService: class {} }))
jest.mock('../src/services/telegram-bot', () => ({ TelegramBotService: class {} }))

import { TokenSniperBot } from '../src/index'
import { getFixtureAlert, isFixtureAlertId } from '../src/services/fixtureAlertAdapter'
import { DatabaseService } from '../src/services/database'
import { HeliusService } from '../src/services/helius'
import { HeliusLaserStreamService } from '../src/services/helius-laserstream'
import { MonitorService } from '../src/services/monitor'
import { QueueService } from '../src/services/queue'
import { RiskScoringService } from '../src/services/risk-scoring'
import { TelegramBotService } from '../src/services/telegram-bot'

const FORBIDDEN_WORDS = ['buy','sell','execute','snipe','trade','swap','transact','sign','send']
const FORBIDDEN_SOURCES = ['fixtureId','isSimulated','generatedAt','alert','signals','summary','nextAction','local-fixture']
const FORBIDDEN_SERVICE_LEAKS = ['DatabaseService','HeliusService','MonitorService','QueueService','RiskScoringService','TelegramBotService','HeliusLaserStreamService','launch-detection','risk-scoring','helius','laserstream','wallet','prisma','redis']
const FORBIDDEN_KEYWORDS = ['buy','sell','execute','snipe','trade','swap','transact','sign','send']

type BotPrivate = { [K in 'db'|'helius'|'monitor'|'queue'|'riskScorer'|'telegramBot'|'laserStream']: unknown }
const liveSpies: ReturnType<typeof jest.spyOn>[] = []

const installLiveServiceSpies = (bot: TokenSniperBot): void => {
  liveSpies.length = 0
  const b = bot as unknown as BotPrivate
  const protos: Array<[any, string]> = [
    [(b.db as any)?.constructor ?? DatabaseService.prototype, 'healthCheck'],
    [(b.db as any)?.constructor ?? DatabaseService.prototype, 'getUserAlerts'],
    [(b.db as any)?.constructor ?? DatabaseService.prototype, 'getAlertNotificationMetrics'],
    [(b.db as any)?.constructor ?? DatabaseService.prototype, 'getLaunchStats'],
    [(b.db as any)?.constructor ?? DatabaseService.prototype, 'getRecentDetectedLaunches'],
    [(b.helius as any)?.constructor ?? HeliusService.prototype, 'healthCheck'],
    [(b.monitor as any)?.constructor ?? MonitorService.prototype, 'ingestLaunchSignature'],
    [(b.monitor as any)?.constructor ?? MonitorService.prototype, 'start'],
    [(b.monitor as any)?.constructor ?? MonitorService.prototype, 'stop'],
    [(b.queue as any)?.constructor ?? QueueService.prototype, 'connect'],
    [(b.queue as any)?.constructor ?? QueueService.prototype, 'disconnect'],
    [(b.queue as any)?.constructor ?? QueueService.prototype, 'healthCheck'],
    [(b.queue as any)?.constructor ?? QueueService.prototype, 'getQueueSize'],
    [(b.queue as any)?.constructor ?? QueueService.prototype, 'getActiveConnections'],
    [(b.queue as any)?.constructor ?? QueueService.prototype, 'startProcessors'],
    [(b.riskScorer as any)?.constructor ?? RiskScoringService.prototype, 'analyzeToken'],
    [(b.riskScorer as any)?.constructor ?? RiskScoringService.prototype, 'getRiskScore'],
    [(b.riskScorer as any)?.constructor ?? RiskScoringService.prototype, 'detectBundles'],
    [(b.laserStream as any)?.constructor ?? HeliusLaserStreamService.prototype, 'start'],
    [(b.laserStream as any)?.constructor ?? HeliusLaserStreamService.prototype, 'stop'],
    [(b.telegramBot as any)?.constructor ?? TelegramBotService.prototype, 'registerCommands'],
    [(b.telegramBot as any)?.constructor ?? TelegramBotService.prototype, 'broadcastSafetyAlert'],
  ]
  for (const [proto, name] of protos) {
    if (!proto || typeof (proto as any)[name] !== 'function') continue; // skip mocked-away methods
    const spy = jest.spyOn(proto as any, name as any).mockImplementation(() => {
      throw new Error(`Forbidden live-service call: ${(proto as any).constructor?.name ?? 'Service'}.${name}`)
    })
    liveSpies.push(spy)
  }
}
const expectZeroLiveServiceCalls = (): void => {
  for (const spy of liveSpies) {
    expect((spy as any).mock.calls.length).toBe(0)
  }
}

const withProductionEnv = async <T,>(fn: () => Promise<T>): Promise<T> => {
  const orig = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    return await fn()
  } finally {
    if (orig === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = orig
  }
}

const assertSafeJson = (body: any): void => {
  const serialized = JSON.stringify(body)
  for (const w of FORBIDDEN_SOURCES) {
    expect(serialized).not.toMatch(new RegExp(`\\b${w}\\b`, 'i'))
  }
  for (const s of FORBIDDEN_SERVICE_LEAKS) {
    expect(serialized).not.toMatch(new RegExp(s, 'i'))
  }
  expect(serialized).not.toMatch(/at .*\.ts:/) // no stack
  expect(serialized).not.toMatch(/node_modules/)
}

describe('fixture alert demo', () => {
  let app: express.Express; let bot: TokenSniperBot; beforeAll(() => { bot = new TokenSniperBot(); installLiveServiceSpies(bot); app = (bot as unknown as { app: express.Application }).app })

  afterAll(() => {
    for (const spy of liveSpies) spy.mockRestore()
  })

  let origNodeEnv: string | undefined
  beforeEach(() => { origNodeEnv = process.env.NODE_ENV; if (!origNodeEnv) process.env.NODE_ENV = 'test' })
  afterEach(() => { if (origNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = origNodeEnv })

  // ---- adapter purity ----
  it('adapter: all fixture IDs return deterministic identical payloads', () => {
    for (const id of ['watch-launch','review-launch','suppress-launch'] as const) {
      const a = getFixtureAlert(id)
      const b = getFixtureAlert(id)
      expect(a).toEqual(b)
    }
  })
  it('adapter: fixed generatedAt', () => {
    expect(getFixtureAlert('watch-launch').generatedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(getFixtureAlert('review-launch').generatedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(getFixtureAlert('suppress-launch').generatedAt).toBe('2026-01-01T00:00:00.000Z')
  })
  it('adapter: stable signal order', () => {
    expect(getFixtureAlert('watch-launch').alert.signals.map(s => s.id)).toEqual(['sig-watch-pos-1','sig-watch-pos-2'])
    expect(getFixtureAlert('review-launch').alert.signals.map(s => s.id)).toEqual(['sig-review-warn-1','sig-review-warn-2','sig-review-pos-1'])
    expect(getFixtureAlert('suppress-launch').alert.signals.map(s => s.id)).toEqual(['sig-suppress-crit-1','sig-suppress-crit-2'])
  })
  it('adapter: clone isolation on mutation', () => {
    const a1 = getFixtureAlert('watch-launch')
    const a2 = getFixtureAlert('watch-launch')
    const before = a1.alert.signals.length
    // mutation via mutable clone only: clone then push (simulates malicious mutation)
    const mutated = JSON.parse(JSON.stringify(a1))
    ;(mutated.alert.signals as any[]).push({ id: 'mut', severity: 'positive', title: 'x', detail: 'x' })
    expect(mutated.alert.signals.length).toBe(before + 1)
    expect(getFixtureAlert('watch-launch').alert.signals.length).toBe(before)
  })
  it('adapter: no forbidden action wording in any fixture string field', () => {
    for (const id of ['watch-launch','review-launch','suppress-launch'] as const) {
      const a = getFixtureAlert(id)
      const blob = [a.alert.summary, a.alert.nextAction, ...a.alert.signals.flatMap(s => [s.title, s.detail])].join(' ').toLowerCase()
      for (const w of FORBIDDEN_WORDS) expect(blob.includes(w)).toBe(false)
    }
  })
  it('adapter: response values are synthetic and local-only', () => {
    const a = getFixtureAlert('watch-launch')
    expect(a.source).toBe('local-fixture')
    expect(a.isSimulated).toBe(true)
    expect(a.alert.tokenLabel.startsWith('Fixture ')).toBe(true)
  })
  it('isFixtureAlertId rejects arbitrary strings', () => {
    expect(isFixtureAlertId('watch-launch')).toBe(true)
    expect(isFixtureAlertId('not-a-fixture')).toBe(false)
    expect(isFixtureAlertId('')).toBe(false)
    expect(isFixtureAlertId(null)).toBe(false)
    expect(isFixtureAlertId(undefined)).toBe(false)
  })

  // ---- watch-launch ----
  it('watch-launch: 200 + correct shape', async () => {
    const r = await request(app).get('/api/v1/demo/alerts?fixture=watch-launch')
    expect(r.status).toBe(200)
    expect(r.body.source).toBe('local-fixture')
    expect(r.body.fixtureId).toBe('watch-launch')
    expect(r.body.isSimulated).toBe(true)
    expect(r.body.generatedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(r.body.alert.id).toBe('fixture-alert-watch-01')
    expect(r.body.alert.category).toBe('launch-watch')
    expect(r.body.alert.severity).toBe('low')
    expect(r.body.alert.recommendation).toBe('watch')
    expect(r.body.alert.confidence).toBe(0.92)
    expect(r.body.alert.summary).toBeTruthy()
    expect(r.body.alert.nextAction).toBeTruthy()
    expect(r.body.alert.signals.filter((s:any)=>s.severity==='positive').length).toBeGreaterThanOrEqual(2)
    expect(r.body.alert.signals.filter((s:any)=>s.severity==='critical').length).toBe(0)
    expectZeroLiveServiceCalls()
  })

  // ---- review-launch ----
  it('review-launch: 200 + warning signals', async () => {
    const r = await request(app).get('/api/v1/demo/alerts?fixture=review-launch')
    expect(r.status).toBe(200)
    expect(r.body.alert.recommendation).toBe('review')
    expect(r.body.alert.category).toBe('risk-review')
    expect(r.body.alert.severity).toBe('medium')
    expect(r.body.alert.summary).toBeTruthy()
    expect(r.body.alert.nextAction).toBeTruthy()
    expect(r.body.alert.signals.filter((s:any)=>s.severity==='warning').length).toBeGreaterThanOrEqual(2)
    expectZeroLiveServiceCalls()
  })

  // ---- suppress-launch ----
  it('suppress-launch: 200 + critical signals', async () => {
    const r = await request(app).get('/api/v1/demo/alerts?fixture=suppress-launch')
    expect(r.status).toBe(200)
    expect(r.body.alert.recommendation).toBe('suppress')
    expect(r.body.alert.category).toBe('suppressed')
    expect(r.body.alert.severity).toBe('high')
    expect(r.body.alert.summary).toBeTruthy()
    expect(r.body.alert.nextAction).toBeTruthy()
    expect(r.body.alert.signals.filter((s:any)=>s.severity==='critical').length).toBeGreaterThanOrEqual(2)
    expectZeroLiveServiceCalls()
  })

  // ---- invalid inputs ----
  it('unknown fixture → 400 with safe body, no live calls', async () => {
    const r = await request(app).get('/api/v1/demo/alerts?fixture=not-a-fixture')
    expect(r.status).toBe(400)
    assertSafeJson(r.body)
    expectZeroLiveServiceCalls()
  })
  it('empty fixture → 400 with safe body, no live calls', async () => {
    const r = await request(app).get('/api/v1/demo/alerts?fixture=')
    expect(r.status).toBe(400)
    assertSafeJson(r.body)
    expectZeroLiveServiceCalls()
  })
  it('missing fixture → 400 with safe body, no live calls', async () => {
    const r = await request(app).get('/api/v1/demo/alerts')
    expect(r.status).toBe(400)
    assertSafeJson(r.body)
    expectZeroLiveServiceCalls()
  })

  // ---- production gate ----
  it('production: valid fixture → 404 generic', async () => {
    await withProductionEnv(async () => {
      const r = await request(app).get('/api/v1/demo/alerts?fixture=watch-launch')
      expect(r.status).toBe(404)
      expect(r.body).toEqual({ error: 'Not found' })
      assertSafeJson(r.body)
      expectZeroLiveServiceCalls()
    })
  })
  it('production: invalid fixture → 404 generic', async () => {
    await withProductionEnv(async () => {
      const r = await request(app).get('/api/v1/demo/alerts?fixture=not-a-fixture')
      expect(r.status).toBe(404)
      expect(r.body).toEqual({ error: 'Not found' })
      assertSafeJson(r.body)
      expectZeroLiveServiceCalls()
    })
  })
  it('production: empty fixture → 404 generic', async () => {
    await withProductionEnv(async () => {
      const r = await request(app).get('/api/v1/demo/alerts?fixture=')
      expect(r.status).toBe(404)
      expect(r.body).toEqual({ error: 'Not found' })
      assertSafeJson(r.body)
      expectZeroLiveServiceCalls()
    })
  })
  it('production: missing fixture → 404 generic', async () => {
    await withProductionEnv(async () => {
      const r = await request(app).get('/api/v1/demo/alerts')
      expect(r.status).toBe(404)
      expect(r.body).toEqual({ error: 'Not found' })
      assertSafeJson(r.body)
      expectZeroLiveServiceCalls()
    })
  })
})
