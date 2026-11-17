import { PublicKey, type AccountInfo } from '@solana/web3.js'
import { HeliusService } from '../src/services/helius'

jest.mock('@solana/web3.js', () => {
  const connection = {
    getBalance: jest.fn(),
    onAccountChange: jest.fn(),
    onProgramAccountChange: jest.fn(),
  }
  return {
    ...jest.requireActual('@solana/web3.js'),
    Connection: jest.fn(() => connection),
    __connection: connection,
  }
})

const connection = jest.requireMock('@solana/web3.js').__connection as {
  getBalance: jest.Mock
  onAccountChange: jest.Mock
  onProgramAccountChange: jest.Mock
}
const owner = new PublicKey('11111111111111111111111111111111')

function accountInfo(data: Uint8Array) {
  return {
    executable: false,
    owner,
    lamports: BigInt('9007199254740993'),
    data,
    rentEpoch: BigInt(0),
    space: BigInt(data.byteLength),
  }
}

describe('HeliusService with @solana/web3.js 3.2.1 RPC shapes', () => {
  beforeEach(() => {
    for (const mock of Object.values(connection)) mock.mockReset()
  })

  it('preserves a branded bigint Lamports balance above Number.MAX_SAFE_INTEGER', async () => {
    const lamports = BigInt('9007199254740993')
    connection.getBalance.mockResolvedValue(lamports)

    const balance = await new HeliusService().getAccountBalance(
      owner.toBase58(),
    )

    expect(balance).toBe(lamports)
    expect(typeof balance).toBe('bigint')
  })

  it('delivers Uint8Array account data through account subscriptions', async () => {
    const bytes = Uint8Array.of(1, 2, 3)
    connection.onAccountChange.mockImplementation(
      (_publicKey: PublicKey, callback: (info: AccountInfo<Uint8Array>) => void) => {
        callback(accountInfo(bytes))
        return 1
      },
    )
    const received: AccountInfo<Uint8Array>[] = []

    await new HeliusService().subscribeToAccount(owner.toBase58(), (info) => {
      received.push(info)
    })

    expect(received[0]?.data).toBe(bytes)
    expect(received[0]?.data).toBeInstanceOf(Uint8Array)
    expect(received[0]?.lamports).toBe(BigInt('9007199254740993'))
  })

  it('delivers Uint8Array program account data without using Buffer', async () => {
    const bytes = Uint8Array.of(4, 5, 6)
    connection.onProgramAccountChange.mockImplementation(
      (
        _programId: PublicKey,
        callback: (
          value: { accountId: PublicKey; accountInfo: AccountInfo<Uint8Array> },
        ) => void,
      ) => {
        callback({ accountId: owner, accountInfo: accountInfo(bytes) })
        return 2
      },
    )
    const received: Array<{
      info: AccountInfo<Uint8Array>
      accountKey: string
    }> = []

    await new HeliusService().subscribeToProgram(
      owner.toBase58(),
      (info, accountKey) => {
        received.push({ info, accountKey })
      },
    )

    expect(received[0]?.info.data).toBe(bytes)
    expect(received[0]?.info.data).toBeInstanceOf(Uint8Array)
    expect(received[0]?.accountKey).toBe(owner.toBase58())
  })
})
