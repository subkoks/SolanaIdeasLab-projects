import net from 'node:net'
import { PublicKey } from '@solana/web3.js'
import { HeliusService } from '../src/services/helius'

jest.mock('@solana/web3.js', () => {
  const connection = { getAccountInfo: jest.fn(), getParsedAccountInfo: jest.fn() }
  return { ...jest.requireActual('@solana/web3.js'), Connection: jest.fn(() => connection), __connection: connection }
})
const connection = jest.requireMock('@solana/web3.js').__connection as Record<string, jest.Mock>
const TOKEN = 'US517G5965aydkZ46HS38QLi7UQiSojurfbQfKCELFx'
const LEGACY = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
const AUTHORITY = new PublicKey(Buffer.alloc(32, 10)).toBase58()
const info = { decimals: 0, supply: '18446744073709551615', mintAuthority: null,
  freezeAuthority: null, isInitialized: true }
const mint = (fields: unknown = info, program = LEGACY) => ({ value: { executable: false,
  owner: new PublicKey(program), data: { parsed: { type: 'mint', info: fields } },
} })

describe('Sniper mint metadata comes from validated parsed RPC fields', () => {
  let guard: jest.SpyInstance
  beforeAll(() => { guard = jest.spyOn(net.Socket.prototype, 'connect').mockImplementation(() => {
    throw new Error('Network forbidden in metadata tests')
  }) })
  afterAll(() => guard.mockRestore())
  beforeEach(() => {
    for (const mock of Object.values(connection)) mock.mockReset()
    connection.getAccountInfo.mockResolvedValue({ data: Buffer.alloc(82), executable: false, owner: new PublicKey(LEGACY) })
    connection.getParsedAccountInfo.mockResolvedValue(mint())
  })
  it.each([['spl-token', LEGACY], ['token-2022', TOKEN_2022]])('preserves real %s zero decimals, raw u64 supply and absent authorities', async (tokenProgram, owner) => {
    connection.getParsedAccountInfo.mockResolvedValue(mint(info, owner))
    await expect(new HeliusService().getTokenMetadata(TOKEN)).resolves.toMatchObject({
      tokenAddress: TOKEN, decimals: 0, supply: info.supply, mintAuthority: null, freezeAuthority: null, tokenProgram,
    })
    expect(connection.getAccountInfo).not.toHaveBeenCalled()
  })
  it('preserves active authorities instead of treating account bytes as an object', async () => {
    connection.getParsedAccountInfo.mockResolvedValue(mint({ ...info, mintAuthority: AUTHORITY, freezeAuthority: AUTHORITY }))
    await expect(new HeliusService().getTokenMetadata(TOKEN)).resolves.toMatchObject({ mintAuthority: AUTHORITY, freezeAuthority: AUTHORITY })
  })
  it.each([
    ['So11111111111111111111111111111111111111112', LEGACY, 'spl-token'],
    ['9pan9bMn5HatX4EJdBwg9VgCa7Uz5HL8N1m5D3NdXejP', TOKEN_2022, 'token-2022'],
  ])('accepts canonical native mint %s only with its real profile', async (address, owner, tokenProgram) => {
    connection.getParsedAccountInfo.mockResolvedValue(mint({ ...info, decimals: 9, supply: '0' }, owner))
    await expect(new HeliusService().getTokenMetadata(address)).resolves.toMatchObject({ decimals: 9, supply: '0', tokenProgram })
  })
  it.each(['profile', 'program'])('rejects a native mint with contradictory %s', async condition => {
    connection.getParsedAccountInfo.mockResolvedValue(mint(
      { ...info, decimals: condition === 'profile' ? 0 : 9, supply: '0' },
      condition === 'program' ? TOKEN_2022 : LEGACY,
    ))
    await expect(new HeliusService().getTokenMetadata('So11111111111111111111111111111111111111112'))
      .rejects.toThrow('Token observations unavailable')
  })
  const invalid: Array<[string, unknown]> = [
    ['missing authority', { ...info, mintAuthority: undefined }],
    ['missing freeze authority', { ...info, freezeAuthority: undefined }],
    ['invalid authority', { ...info, mintAuthority: 'invalid' }],
    ['negative supply', { ...info, supply: '-1' }],
    ['overflow supply', { ...info, supply: '18446744073709551616' }],
    ['numeric supply', { ...info, supply: 100 }],
    ['uninitialized mint', { ...info, isInitialized: false }],
    ['fractional decimals', { ...info, decimals: 1.5 }],
    ['oversized decimals', { ...info, decimals: 256 }],
  ]
  it.each(invalid)('rejects %s without invented metadata', async (_name, fields) => {
    connection.getParsedAccountInfo.mockResolvedValue(mint(fields))
    await expect(new HeliusService().getTokenMetadata(TOKEN)).rejects.toThrow('Token observations unavailable')
  })
  it('rejects accounts owned by an unsupported program', async () => {
    connection.getParsedAccountInfo.mockResolvedValue(mint(info, AUTHORITY))
    await expect(new HeliusService().getTokenMetadata(TOKEN)).rejects.toThrow('Token observations unavailable')
  })
  it('rejects executable accounts', async () => {
    const response = mint()
    response.value.executable = true
    connection.getParsedAccountInfo.mockResolvedValue(response)
    await expect(new HeliusService().getTokenMetadata(TOKEN)).rejects.toThrow('Token observations unavailable')
  })
  it('rejects undecoded account bytes rather than defaulting supply and authorities', async () => {
    connection.getParsedAccountInfo.mockResolvedValue({ value: { executable: false, owner: new PublicKey(LEGACY), data: Buffer.alloc(82) } })
    await expect(new HeliusService().getTokenMetadata(TOKEN)).rejects.toThrow('Token observations unavailable')
  })
  it('returns null only for a genuinely missing mint or a decoded nonmint account', async () => {
    connection.getParsedAccountInfo.mockResolvedValueOnce({ value: null }).mockResolvedValueOnce({ value: {
      executable: false, owner: new PublicKey(LEGACY), data: { parsed: { type: 'account', info: {} } },
    } })
    const service = new HeliusService()
    await expect(service.getTokenMetadata(TOKEN)).resolves.toBeNull()
    await expect(service.getTokenMetadata(TOKEN)).resolves.toBeNull()
  })
  it('propagates a sanitized availability error instead of substituting missing metadata', async () => {
    connection.getAccountInfo.mockRejectedValue(new Error('Synthetic private provider detail'))
    connection.getParsedAccountInfo.mockRejectedValue(new Error('Synthetic private provider detail'))
    await expect(new HeliusService().getTokenMetadata(TOKEN)).rejects.toThrow('Token observations unavailable')
  })
})
