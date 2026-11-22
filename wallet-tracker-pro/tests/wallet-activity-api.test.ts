let mockReady = true
const mockDatabase = {
  connect: jest.fn(), disconnect: jest.fn(),
  getRecentActivity: jest.fn(), getActivityBreakdown: jest.fn(), getActivityTimeline: jest.fn(),
  getWalletBehaviorSummary: jest.fn(), getTokenMintBreakdown: jest.fn(), getWalletPortfolioSummary: jest.fn(),
}
const mockConstructDatabase = jest.fn()
jest.mock('next/server', () => ({ NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }) } }))
jest.mock('@/services/database', () => ({ DatabaseService: class { constructor() { mockConstructDatabase(); return mockDatabase } } }), { virtual: true })
jest.mock('@/services/solana-watcher', () => ({ SolanaWatcherService: class { isValidAddress() { return true } } }), { virtual: true })
jest.mock('@/lib/wallet-delivery-gate', () => ({ get WALLET_DELIVERY_SCHEMA_VERIFIED() { return mockReady } }), { virtual: true })

import { GET } from '../src/app/api/activity/[wallet]/route'

describe('durable activity API identities', () => {
  beforeEach(() => { jest.clearAllMocks(); mockReady = true })

  it('returns distinct stable activity IDs for movements sharing a signature', async () => {
    const rows = ['wa1_sol', 'wa1_mint1', 'wa1_mint2'].map((id) => ({
      id, signature: 'shared-synthetic-signature', direction: 'in', summary: 'Synthetic activity',
      tokenMint: null, observedAt: new Date('2026-01-01T00:00:00Z'),
    }))
    mockDatabase.getRecentActivity.mockResolvedValue(rows)
    const result = await GET(new Request('http://localhost/api/activity/wallet'), { params: Promise.resolve({ wallet: 'wallet' }) }) as unknown as { body: { activity: Array<{ id: string }> } }
    expect(result.body.activity.map((event) => event.id)).toEqual(rows.map((row) => row.id))
    expect(mockDatabase.disconnect).toHaveBeenCalledTimes(1)
  })

  it('makes disabled/unmigrated mode visible without constructing or connecting a database', async () => {
    mockReady = false
    const result = await GET(new Request('http://localhost/api/activity/wallet'), { params: Promise.resolve({ wallet: 'wallet' }) }) as unknown as { status: number; body: unknown }
    expect(result.status).toBe(503)
    expect(result.body).toEqual({ error: 'Wallet activity is disabled pending reviewed delivery migration' })
    expect(mockConstructDatabase).not.toHaveBeenCalled()
    expect(mockDatabase.connect).not.toHaveBeenCalled()
  })

  it('sanitizes internal errors while retaining disconnection', async () => {
    mockDatabase.getRecentActivity.mockRejectedValueOnce(new Error('Synthetic connection detail'))
    const result = await GET(new Request('http://localhost/api/activity/wallet'), { params: Promise.resolve({ wallet: 'wallet' }) }) as unknown as { status: number; body: unknown }
    expect(result).toEqual({ status: 500, body: { error: 'Failed to load wallet activity' } })
    expect(mockDatabase.disconnect).toHaveBeenCalledTimes(1)
  })

})
