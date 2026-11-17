import net from 'node:net'
import { PublicKey } from '@solana/web3.js'
import { HeliusService } from '../src/services/helius'

jest.mock('@solana/web3.js', () => {
  const connection = { getTokenSupply: jest.fn(), getTokenLargestAccounts: jest.fn() }
  return { ...jest.requireActual('@solana/web3.js'), Connection: jest.fn(() => connection), __connection: connection }
})
const connection = jest.requireMock('@solana/web3.js').__connection as Record<string, jest.Mock>
const TOKEN = new PublicKey(Buffer.alloc(32, 7)).toBase58()
const row = (id: number, amount = '1', uiAmount: number | null = null) => ({
  address: new PublicKey(Buffer.alloc(32, id)), amount, uiAmount,
})

describe('Sniper raw supply and largest-account observations', () => {
  let guard: jest.SpyInstance
  beforeAll(() => { guard = jest.spyOn(net.Socket.prototype, 'connect').mockImplementation(() => {
    throw new Error('Network forbidden in balance tests')
  }) })
  afterAll(() => guard.mockRestore())
  beforeEach(() => {
    for (const mock of Object.values(connection)) mock.mockReset()
    connection.getTokenSupply.mockResolvedValue({ value: { amount: '18446744073709551615', decimals: 0, uiAmount: null } })
    connection.getTokenLargestAccounts.mockResolvedValue({ value: [] })
  })
  it('retains exact raw u64 supply and genuine zero supply', async () => {
    const service = new HeliusService()
    await expect(service.getTokenSupply(TOKEN)).resolves.toBe('18446744073709551615')
    connection.getTokenSupply.mockResolvedValue({ value: { amount: '0', decimals: 9, uiAmount: null } })
    await expect(service.getTokenSupply(TOKEN)).resolves.toBe('0')
  })
  it.each(['-1', '18446744073709551616', 100, undefined])('rejects invalid raw supply %s', async amount => {
    connection.getTokenSupply.mockResolvedValue({ value: { amount, decimals: 9, uiAmount: 1 } })
    await expect(new HeliusService().getTokenSupply(TOKEN)).rejects.toThrow('Token observations unavailable')
  })
  it.each(['getTokenSupply', 'getTokenSupplyUi', 'getTokenLargestAccounts', 'getTokenHolders'] as const)(
    'does not substitute defaults when %s transport fails', async method => {
      connection.getTokenSupply.mockRejectedValue(new Error('Synthetic private provider detail'))
      connection.getTokenLargestAccounts.mockRejectedValue(new Error('Synthetic private provider detail'))
      await expect(new HeliusService()[method](TOKEN)).rejects.toThrow('Token observations unavailable')
    },
  )
  it('uses raw positive balances even when UI amounts are null or incorrectly nonzero', async () => {
    connection.getTokenLargestAccounts.mockResolvedValue({ value: [row(1, '1'), row(2, '0', 99)] })
    await expect(new HeliusService().getTokenHolders(TOKEN)).resolves.toEqual([row(1).address.toBase58()])
  })
  it('sorts all validated raw balances before selecting the requested slice', async () => {
    connection.getTokenLargestAccounts.mockResolvedValue({ value: Array.from({ length: 12 }, (_, index) =>
      row(index + 1, index === 11 ? '9007199254740993' : '1')) })
    const accounts = await new HeliusService().getTokenLargestAccounts(TOKEN)
    expect(accounts).toHaveLength(10)
    expect(accounts[0].amount).toBe('9007199254740993')
    expect(accounts[0].address).toBe(row(12).address.toBase58())
  })
  it('rejects duplicate token-account rows', async () => {
    connection.getTokenLargestAccounts.mockResolvedValue({ value: [row(1), row(1)] })
    await expect(new HeliusService().getTokenLargestAccounts(TOKEN)).rejects.toThrow('Token observations unavailable')
  })
  it.each(['-1', '18446744073709551616', 1])('rejects invalid raw balance %s', async amount => {
    connection.getTokenLargestAccounts.mockResolvedValue({ value: [{ ...row(1), amount }] })
    await expect(new HeliusService().getTokenLargestAccounts(TOKEN)).rejects.toThrow('Token observations unavailable')
  })
  it('rejects more than the RPC maximum of 20 largest accounts', async () => {
    connection.getTokenLargestAccounts.mockResolvedValue({ value: Array.from({ length: 21 }, (_, index) => row(index + 1)) })
    await expect(new HeliusService().getTokenLargestAccounts(TOKEN, 100)).rejects.toThrow('Token observations unavailable')
  })
  it('retains genuine empty successful largest-account observations', async () => {
    await expect(new HeliusService().getTokenLargestAccounts(TOKEN)).resolves.toEqual([])
  })
  it('derives approximate display supply from raw amount and decimals instead of a UI default', async () => {
    connection.getTokenSupply.mockResolvedValue({ value: { amount: '150', decimals: 2, uiAmount: 9999 } })
    await expect(new HeliusService().getTokenSupplyUi(TOKEN)).resolves.toBe(1.5)
  })
  it.each([undefined, -1, 256, 0.5])('rejects incomplete/invalid supply decimals %s', async decimals => {
    connection.getTokenSupply.mockResolvedValue({ value: { amount: '150', decimals } })
    await expect(new HeliusService().getTokenSupplyUi(TOKEN)).rejects.toThrow('Token observations unavailable')
  })
  it.each([0, -1, 101, 1.5, NaN])('rejects invalid selection limit %s before RPC', async limit => {
    await expect(new HeliusService().getTokenLargestAccounts(TOKEN, limit)).rejects.toThrow('Token observations unavailable')
    expect(connection.getTokenLargestAccounts).not.toHaveBeenCalled()
  })
})
