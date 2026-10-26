import express from 'express'
import request from 'supertest'
import { PublicKey } from '@solana/web3.js'
import { TokenSniperBot } from '../src/index'
import { HeliusService } from '../src/services/helius'
import { DatabaseService } from '../src/services/database'

jest.mock('@solana/web3.js', () => {
  const connection = { getParsedAccountInfo: jest.fn() }
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
// Auth is outside this observation-boundary test; no real identity or token is used.
jest.mock('../src/middleware/auth', () => ({
  ...jest.requireActual('../src/middleware/auth'),
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

const connection = jest.requireMock('@solana/web3.js').__connection as Record<string, jest.Mock>
const TOKEN = 'US517G5965aydkZ46HS38QLi7UQiSojurfbQfKCELFx'
const LEGACY = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const AUTHORITY = new PublicKey(Buffer.alloc(32, 10)).toBase58()
const mint = (authority: string | null = null) => ({ value: { executable: false, owner: new PublicKey(LEGACY),
  data: { parsed: { type: 'mint', info: { decimals: 0, supply: '1000', mintAuthority: authority,
    freezeAuthority: authority, isInitialized: true } } },
} })
const create = () => {
  const bot = new TokenSniperBot()
  const internal = bot as unknown as { tokenRoutes: () => express.Router; db: DatabaseService }
  const app = express().use(express.json()).use(internal.tokenRoutes())
  return { app, db: internal.db }
}

describe('validated Sniper metadata reaches real risk scoring and HTTP routes', () => {
  beforeEach(() => {
    connection.getParsedAccountInfo.mockReset().mockResolvedValue(mint())
    jest.spyOn(HeliusService.prototype, 'getTokenSupply').mockResolvedValue('1000')
    jest.spyOn(HeliusService.prototype, 'getTokenSupplyUi').mockResolvedValue(1000)
    jest.spyOn(HeliusService.prototype, 'getTokenHolders').mockResolvedValue([])
    jest.spyOn(HeliusService.prototype, 'getTokenLargestAccounts').mockResolvedValue([{ address: AUTHORITY, amount: '100', uiAmount: 99999 }])
  })
  afterEach(() => jest.restoreAllMocks())

  it('reports actual authority absence separately from unverified liquidity locks', async () => {
    const response = await request(create().app).get(`/${TOKEN}/score`)
    expect(response.status).toBe(200)
    expect(response.body.factors).toMatchObject({ renouncedMint: true, freezeAuthorityRevoked: true, liquidityLocked: null })
    expect(response.body.recommendations).toContain('Liquidity lock status has not been verified')
    expect(response.body.categories.contract).toBe(100)
  })
  it('penalizes active authorities rather than penalizing revoked authorities', async () => {
    connection.getParsedAccountInfo.mockResolvedValue(mint(AUTHORITY))
    const response = await request(create().app).get(`/${TOKEN}/score`)
    expect(response.status).toBe(200)
    expect(response.body.factors).toMatchObject({ renouncedMint: false, freezeAuthorityRevoked: false, liquidityLocked: null })
    expect(response.body.categories.contract).toBe(50)
    expect(response.body.recommendations).toContain('🔒 Freeze authority is active - the issuer can freeze token accounts')
  })
  it.each(['score', 'analyze'])('returns sanitized 503 on metadata transport failure via %s without caching a score', async route => {
    connection.getParsedAccountInfo.mockRejectedValue(new Error('Synthetic private upstream detail'))
    const { app, db } = create()
    const response = route === 'score' ? await request(app).get(`/${TOKEN}/score`)
      : await request(app).post('/analyze').send({ tokenAddress: TOKEN })
    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'Token observations unavailable', code: 'TOKEN_OBSERVATIONS_UNAVAILABLE' })
    expect(db.setCache).not.toHaveBeenCalled()
    expect(HeliusService.prototype.getTokenSupply).not.toHaveBeenCalled()
    expect(response.text).not.toContain('Synthetic private')
  })
  it('rejects incomplete authority data instead of returning a scored report', async () => {
    const responseData = mint()
    delete (responseData.value.data.parsed.info as Partial<typeof responseData.value.data.parsed.info>).mintAuthority
    connection.getParsedAccountInfo.mockResolvedValue(responseData)
    const { app, db } = create()
    const response = await request(app).get(`/${TOKEN}/score`)
    expect(response.status).toBe(503)
    expect(response.body).not.toHaveProperty('total')
    expect(db.setCache).not.toHaveBeenCalled()
  })
  it('preserves genuinely missing-mint 404 behavior', async () => {
    connection.getParsedAccountInfo.mockResolvedValue({ value: null })
    const response = await request(create().app).get(`/${TOKEN}/score`)
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Token not found' })
  })
  it.each(['risk_score', 'risk_score_v2'])('preserves but never reuses %s cached default-observation scores', async namespace => {
    const { app, db } = create()
    const old = { total: 99, marker: 'legacy metadata defaults' }
    const legacyKey = `${namespace}_${TOKEN}_quick`
    await db.setCache(legacyKey, old)
    const first = await request(app).get(`/${TOKEN}/score`)
    const second = await request(app).get(`/${TOKEN}/score`)
    expect(first.status).toBe(200)
    expect(second.body).toEqual(first.body)
    expect(first.body).not.toHaveProperty('marker')
    expect(await db.getCache(legacyKey)).toEqual(old)
    expect(connection.getParsedAccountInfo).toHaveBeenCalledTimes(1)
    expect(db.getCache).toHaveBeenCalledWith(`risk_score_v3_${TOKEN}_quick`)
  })
})
