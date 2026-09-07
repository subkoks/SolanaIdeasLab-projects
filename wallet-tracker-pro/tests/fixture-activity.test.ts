/**
 * @jest-environment node
 */
import { NextResponse } from 'next/server'

// Mock next/server first
jest.mock('next/server', () => ({
  NextResponse: Object.assign(
    (_body?: unknown, _init?: { status?: number }) => ({ status: 200, body: undefined, json: (_b?: unknown, _i?: { status?: number }) => ({ status: 200, body: undefined }) } as any),
    {
      json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }),
    },
  ),
}))

// Mock all live services so the fixture route never reaches them
jest.mock('../src/services/database', () => ({ DatabaseService: class {} }))
jest.mock('../src/services/solana-watcher', () => ({ SolanaWatcherService: class {} }))
jest.mock('../src/services/telegram-bot', () => ({ WalletTrackerTelegramBot: class {} }))
jest.mock('../src/lib/config', () => ({ config: { solana: { rpcUrl: 'http://localhost', commitment: 'confirmed' }, watcher: {} }, isTelegramEnabled: () => false }))
jest.mock('../src/lib/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn() } }))

// Import adapter helpers directly (no Next.js involved)
import { getFixtureActivity, isFixtureActivityId } from '../src/services/fixtureActivityAdapter'
import { SolanaWatcherService } from '../src/services/solana-watcher'
import { DatabaseService } from '../src/services/database'

const FORBIDDEN_WORDS = ['buy','sell','trade','swap','execute','transact','sign','send','transfer','withdraw','deposit','balance','profit','loss','investment']
const FORBIDDEN_SOURCES = ['fixtureId','isSimulated','generatedAt','wallet','activity','local-fixture']
const FORBIDDEN_SERVICE_LEAKS = ['SolanaWatcherService','DatabaseService','pollWatchlist','fetchNewMovements','listActiveWatches','recordActivity','WalletTrackerTelegramBot','notifyChat','prisma','redis','rpcUrl']

type LiveSpy = { calls: unknown[][] }
const liveSpies: LiveSpy[] = []

const installLiveServiceSpies = (): void => {
  liveSpies.length = 0
  const protos: Array<[object, string]> = [
    [SolanaWatcherService.prototype, 'pollWatchlist'],
    [SolanaWatcherService.prototype, 'fetchNewMovements'],
    [SolanaWatcherService.prototype, 'parseMovements'],
    [DatabaseService.prototype, 'listActiveWatches'],
    [DatabaseService.prototype, 'recordActivity'],
    [DatabaseService.prototype, 'updateWatchCursor'],
    [DatabaseService.prototype, 'connect'],
    [DatabaseService.prototype, 'disconnect'],
    [DatabaseService.prototype, 'healthCheck'],
  ]
  for (const [proto, name] of protos) {
    if (typeof (proto as any)[name] !== 'function') continue
    const spy = jest.spyOn(proto as any, name as any).mockImplementation(() => { throw new Error(`Forbidden live-service call: ${(proto as any).constructor?.name ?? 'S'}.${name}`) }) as any
    spy.calls = []
    liveSpies.push(spy)
  }
}
const expectZeroLiveServiceCalls = (): void => {
  for (const spy of liveSpies) {
    expect(spy.calls.length).toBe(0)
  }
}

const assertSafeJson = (body: unknown): void => {
  const serialized = JSON.stringify(body)
  for (const w of FORBIDDEN_SOURCES) {
    expect(serialized).not.toMatch(new RegExp(`\\b${w}\\b`, 'i'))
  }
  for (const s of FORBIDDEN_SERVICE_LEAKS) {
    expect(serialized).not.toMatch(new RegExp(s, 'i'))
  }
  expect(serialized).not.toMatch(/at .*\.ts:/)
  expect(serialized).not.toMatch(/node_modules/)
}

// Import the route handler directly (Next.js request/response mocked above)
// Import the route handler via require (CJS) to avoid top-level await
const routeModule = require('../src/app/api/demo/activity/route') as { GET: (request: Request) => Promise<any> }
const { GET } = routeModule

const makeRequest = (url: string): Request => new Request(`http://localhost${url}`, { method: 'GET' }) as unknown as Request

describe('fixture activity demo', () => {
  beforeAll(() => { installLiveServiceSpies() })
  afterAll(() => { for (const s of liveSpies) s.mockRestore?.() })

  let origNodeEnv: string | undefined
  beforeEach(() => { origNodeEnv = process.env.NODE_ENV; if (!origNodeEnv) process.env.NODE_ENV = 'test' })
  afterEach(() => { process.env.NODE_ENV = origNodeEnv === undefined ? 'test' : origNodeEnv })

  // --- adapter purity ---
  it('adapter: all fixture IDs return deterministic identical payloads', () => {
    for (const id of ['steady-wallet','review-wallet','suppress-wallet'] as const) {
      const a = getFixtureActivity(id)
      const b = getFixtureActivity(id)
      expect(a).toEqual(b)
    }
  })
  it('adapter: fixed generatedAt', () => {
    for (const id of ['steady-wallet','review-wallet','suppress-wallet'] as const) {
      expect(getFixtureActivity(id).generatedAt).toBe('2026-01-01T00:00:00.000Z')
    }
  })
  it('adapter: stable activity ordering', () => {
    expect(getFixtureActivity('steady-wallet').activity.map(a => a.id)).toEqual(['act-steady-1','act-steady-2','act-steady-3'])
    expect(getFixtureActivity('review-wallet').activity.map(a => a.id)).toEqual(['act-review-1','act-review-2','act-review-3'])
    expect(getFixtureActivity('suppress-wallet').activity.map(a => a.id)).toEqual(['act-suppress-1','act-suppress-2','act-suppress-3'])
  })
  it('adapter: clone isolation on mutation', () => {
    const a1 = getFixtureActivity('steady-wallet')
    const before = a1.activity.length
    const mutated = JSON.parse(JSON.stringify(a1))
    ;(mutated.activity as unknown[]).push({ id: 'x' })
    expect(mutated.activity.length).toBe(before + 1)
    expect(getFixtureActivity('steady-wallet').activity.length).toBe(before)
  })
  it('adapter: no prohibited action wording', () => {
    for (const id of ['steady-wallet','review-wallet','suppress-wallet'] as const) {
      const a = getFixtureActivity(id)
      const blob = [a.wallet.summary, a.wallet.nextAction, ...a.activity.map(ac => ac.title + ' ' + ac.detail)].join(' ').toLowerCase()
      for (const w of FORBIDDEN_WORDS) {
        expect(blob).not.toMatch(new RegExp(`\\b${w}\\b`))
      }
    }
  })
  it('adapter: synthetic local-only language', () => {
    const a = getFixtureActivity('steady-wallet')
    expect(a.source).toBe('local-fixture')
    expect(a.isSimulated).toBe(true)
    expect(a.wallet.label.startsWith('Fixture ')).toBe(true)
  })
  it('isFixtureActivityId rejects arbitrary strings', () => {
    expect(isFixtureActivityId('steady-wallet')).toBe(true)
    expect(isFixtureActivityId('not-a-fixture')).toBe(false)
    expect(isFixtureActivityId('')).toBe(false)
    expect(isFixtureActivityId(null)).toBe(false)
    expect(isFixtureActivityId(undefined)).toBe(false)
  })

  // --- steady-wallet ---
  it('steady-wallet: 200 + correct shape', async () => {
    const r = await GET(makeRequest('/api/demo/activity?fixture=steady-wallet')) as unknown as { status: number; body: unknown }
    expect(r.status).toBe(200)
    const b = (r as any).body ?? r
    expect((b as any).source).toBe('local-fixture')
    expect((b as any).fixtureId).toBe('steady-wallet')
    expect((b as any).isSimulated).toBe(true)
    expect((b as any).generatedAt).toBe('2026-01-01T00:00:00.000Z')
    expect((b as any).wallet.id).toBe('fixture-wallet-steady-01')
    expect((b as any).wallet.status).toBe('steady')
    expect((b as any).wallet.confidence).toBe(0.91)
    expect((b as any).wallet.summary).toBeTruthy()
    expect((b as any).wallet.nextAction).toBeTruthy()
    const positives = (b as any).activity.filter((a: any) => a.severity === 'positive')
    expect(positives.length).toBeGreaterThanOrEqual(2)
    const criticals = (b as any).activity.filter((a: any) => a.severity === 'critical')
    expect(criticals.length).toBe(0)
    expectZeroLiveServiceCalls()
  })

  // --- review-wallet ---
  it('review-wallet: 200 + warning signals', async () => {
    const r = await GET(makeRequest('/api/demo/activity?fixture=review-wallet')) as unknown as { status: number; body: unknown }
    expect(r.status).toBe(200)
    const b = (r as any).body ?? r
    expect((b as any).wallet.status).toBe('review')
    expect((b as any).wallet.summary).toBeTruthy()
    expect((b as any).wallet.nextAction).toBeTruthy()
    const warnings = (b as any).activity.filter((a: any) => a.severity === 'warning')
    expect(warnings.length).toBeGreaterThanOrEqual(2)
    expectZeroLiveServiceCalls()
  })

  // --- suppress-wallet ---
  it('suppress-wallet: 200 + critical signals', async () => {
    const r = await GET(makeRequest('/api/demo/activity?fixture=suppress-wallet')) as unknown as { status: number; body: unknown }
    expect(r.status).toBe(200)
    const b = (r as any).body ?? r
    expect((b as any).wallet.status).toBe('suppressed')
    expect((b as any).wallet.summary).toBeTruthy()
    expect((b as any).wallet.nextAction).toBeTruthy()
    const criticals = (b as any).activity.filter((a: any) => a.severity === 'critical')
    expect(criticals.length).toBeGreaterThanOrEqual(2)
    expectZeroLiveServiceCalls()
  })

  // --- invalid inputs ---
  it('unknown fixture → 400 safe body, zero live calls', async () => {
    const r = await GET(makeRequest('/api/demo/activity?fixture=not-a-fixture')) as unknown as { status: number; body: unknown }
    expect(r.status).toBe(400)
    assertSafeJson((r as any).body ?? r)
    expectZeroLiveServiceCalls()
  })
  it('empty fixture → 400 safe body, zero live calls', async () => {
    const r = await GET(makeRequest('/api/demo/activity?fixture=')) as unknown as { status: number; body: unknown }
    expect(r.status).toBe(400)
    assertSafeJson((r as any).body ?? r)
    expectZeroLiveServiceCalls()
  })
  it('missing fixture → 400 safe body, zero live calls', async () => {
    const r = await GET(makeRequest('/api/demo/activity')) as unknown as { status: number; body: unknown }
    expect(r.status).toBe(400)
    assertSafeJson((r as any).body ?? r)
    expectZeroLiveServiceCalls()
  })

  // --- production gate ---
  for (const [label, url] of [
    ['valid', '/api/demo/activity?fixture=steady-wallet'],
    ['unknown', '/api/demo/activity?fixture=bad'],
    ['empty', '/api/demo/activity?fixture='],
    ['missing', '/api/demo/activity'],
  ] as const) {
    it(`production: ${label} fixture → 404 generic`, async () => {
      const orig = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
      try {
        const r = await GET(makeRequest(url)) as unknown as { status: number; body: unknown }
        expect(r.status).toBe(404)
        expect((r as any).body).toEqual({ error: 'Not found' })
        assertSafeJson((r as any).body ?? r)
        expectZeroLiveServiceCalls()
      } finally {
        process.env.NODE_ENV = orig
      }
    })
  }
})
