import express from 'express'
import request from 'supertest'
import { PublicKey } from '@solana/web3.js'
import { TokenSniperBot } from '../src/index'
import { DatabaseService } from '../src/services/database'
import { HeliusService } from '../src/services/helius'
import { RiskScoringService } from '../src/services/risk-scoring'

jest.mock('@solana/web3.js', () => {
  const connection = { getParsedAccountInfo: jest.fn(), getTokenSupply: jest.fn(), getTokenLargestAccounts: jest.fn() }
  return { ...jest.requireActual('@solana/web3.js'), Connection: jest.fn(() => connection), __connection: connection }
})
jest.mock('../src/services/database', () => ({ DatabaseService: class {
  cache = new Map()
  getCache = jest.fn(async (key: string) => this.cache.get(key) ?? null)
  setCache = jest.fn(async (key: string, value: unknown) => { this.cache.set(key, value) })
} }))
jest.mock('../src/services/queue', () => ({ QueueService: class {} }))
jest.mock('../src/services/monitor', () => ({ MonitorService: class {} }))
jest.mock('../src/services/helius-laserstream', () => ({ HeliusLaserStreamService: class {} }))
jest.mock('../src/services/telegram-bot', () => ({ TelegramBotService: class {} }))

const connection = jest.requireMock('@solana/web3.js').__connection as Record<string, jest.Mock>
const TOKEN = new PublicKey(Buffer.alloc(32, 7)).toBase58()
const LEGACY = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const row = (id: number, amount = '1') => ({ address: new PublicKey(Buffer.alloc(32, id)), amount, uiAmount: null })
const mint = (supply = '1000') => ({ value: { executable: false, owner: new PublicKey(LEGACY),
  data: { parsed: { type: 'mint', info: { decimals: 9, supply, mintAuthority: null, freezeAuthority: null, isInitialized: true } } },
} })
const create = () => {
  // Exercise the real router and its dependencies without full-app process listeners.
  const internal = Object.create(TokenSniperBot.prototype) as {
    tokenRoutes: () => express.Router; db: DatabaseService; riskScorer: RiskScoringService
  }
  internal.db = new DatabaseService()
  internal.riskScorer = new RiskScoringService(new HeliusService(), internal.db)
  return { app: express().use(internal.tokenRoutes()), db: internal.db }
}

describe('Sniper exact distribution through real HTTP, scorer and adapter', () => {
  beforeEach(() => {
    for (const mock of Object.values(connection)) mock.mockReset()
    connection.getParsedAccountInfo.mockResolvedValue(mint())
    connection.getTokenLargestAccounts.mockResolvedValue({ value: [row(1, '400'), row(2, '100')] })
  })
  it('uses one raw sample for category/factor and exposes its limited account basis', async () => {
    const { app } = create()
    const first = await request(app).get(`/${TOKEN}/score`)
    const cached = await request(app).get(`/${TOKEN}/score`)
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({ factors: { top10Holding: 50 }, categories: { distribution: 60 },
      distributionEvidence: { basis: 'mint-supply', accountBasis: 'token-accounts', supplyRawAmount: '1000',
        top10RawAmount: '500', sampledRawAmount: '500', sampledAccountCount: 2,
        positiveSampledAccountCount: 2, sampleLimit: 20, completeHolderCount: false, liquidityPoolVerified: false } })
    expect(cached.body).toEqual(first.body)
    expect(connection.getTokenLargestAccounts).toHaveBeenCalledTimes(1)
    expect(connection.getParsedAccountInfo).toHaveBeenCalledTimes(1)
    expect(connection.getTokenSupply).not.toHaveBeenCalled()
    expect(first.body.recommendations).toContain('💧 Sparse visible token-account sample - verify DEX liquidity separately')
    expect(JSON.stringify(first.body.recommendations)).not.toContain('difficult to sell')
  })
  it('retains concentration precision above safe integer range with null display amounts', async () => {
    connection.getParsedAccountInfo.mockResolvedValue(mint('18014398509481986'))
    connection.getTokenLargestAccounts.mockResolvedValue({ value: [row(1, '9007199254740993')] })
    const response = await request(create().app).get(`/${TOKEN}/score`)
    expect(response.status).toBe(200)
    expect(response.body.factors.top10Holding).toBe(50)
    expect(response.body.distributionEvidence.top10RawAmount).toBe('9007199254740993')
  })
  it('accepts an approximate display amount above safe-integer range while retaining exact raw math', async () => {
    const amount = '18446744073709551615'
    connection.getParsedAccountInfo.mockResolvedValue(mint(amount))
    connection.getTokenLargestAccounts.mockResolvedValue({ value: [{ ...row(1, amount), uiAmount: Number(amount) }] })
    const response = await request(create().app).get(`/${TOKEN}/score`)
    expect(response.status).toBe(200)
    expect(response.body.factors.top10Holding).toBe(100)
    expect(response.body.distributionEvidence.top10RawAmount).toBe(amount)
  })
  it('keeps strict scoring thresholds when a raw ratio is just above 20 percent', async () => {
    connection.getParsedAccountInfo.mockResolvedValue(mint('1000000000000000000'))
    connection.getTokenLargestAccounts.mockResolvedValue({ value: [row(1, '200000000000000001')] })
    const response = await request(create().app).get(`/${TOKEN}/score`)
    expect(response.status).toBe(200)
    expect(response.body.factors.top10Holding).toBe(20.01)
    expect(response.body.categories.distribution).toBe(80)
  })
  it('includes a largest row returned after the old ten-account slice', async () => {
    connection.getTokenLargestAccounts.mockResolvedValue({ value: Array.from({ length: 12 }, (_, index) =>
      row(index + 1, index === 11 ? '500' : '1')) })
    const response = await request(create().app).get(`/${TOKEN}/score`)
    expect(response.status).toBe(200)
    expect(response.body.factors.top10Holding).toBe(50.9)
    expect(response.body.distributionEvidence.sampledRawAmount).toBe('511')
  })
  it('returns sanitized 503 instead of default50 on largest-account read failure', async () => {
    connection.getTokenLargestAccounts.mockRejectedValue(new Error('Synthetic private upstream detail'))
    const { app, db } = create()
    const response = await request(app).get(`/${TOKEN}/score`)
    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'Token observations unavailable', code: 'TOKEN_OBSERVATIONS_UNAVAILABLE' })
    expect(db.setCache).not.toHaveBeenCalled()
    expect(response.text).not.toContain('Synthetic private')
  })
  it.each(['negative', 'overflow', 'duplicate', 'oversized', 'empty', 'zeros', 'above-supply', 'sum-above-supply'])(
    'does not score/cache %s account observations', async condition => {
      const rows = condition === 'negative' ? [row(1, '-1')]
        : condition === 'overflow' ? [row(1, '18446744073709551616')]
          : condition === 'duplicate' ? [row(1), row(1)]
            : condition === 'oversized' ? Array.from({ length: 21 }, (_, index) => row(index + 1))
              : condition === 'empty' ? [] : condition === 'zeros' ? [row(1, '0')]
                : condition === 'above-supply' ? [row(1, '1001')] : [row(1, '600'), row(2, '600')]
      connection.getTokenLargestAccounts.mockResolvedValue({ value: rows })
      const { app, db } = create()
      const response = await request(app).get(`/${TOKEN}/score`)
      expect(response.status).toBe(503)
      expect(response.body).not.toHaveProperty('total')
      expect(db.setCache).not.toHaveBeenCalled()
    },
  )
  it.each([TOKEN, 'So11111111111111111111111111111111111111112'])(
    'rejects an unsupported zero-supply denominator for %s rather than inventing native concentration', async address => {
      connection.getParsedAccountInfo.mockResolvedValue(mint('0'))
      const { app, db } = create()
      const response = await request(app).get(`/${address}/score`)
      expect(response.status).toBe(503)
      expect(response.body.code).toBe('TOKEN_OBSERVATIONS_UNAVAILABLE')
      expect(db.setCache).not.toHaveBeenCalled()
    },
  )
})
