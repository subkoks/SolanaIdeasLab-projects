/**
 * @jest-environment node
 */
jest.mock('../src/lib/config', () => ({
  config: {
    solana: { rpcUrl: 'http://localhost', commitment: 'confirmed' },
    watcher: { signatureBatchSize: 10, signatureMaxPages: 5 },
  },
}))

jest.mock('../src/lib/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}))

import {
  Connection,
  PublicKey,
  type ConfirmedSignatureInfo,
  type GetVersionedTransactionConfig,
  type ParsedTransactionWithMeta,
  type TokenBalance,
} from '@solana/web3.js'
import { config } from '../src/lib/config'
import {
  createAbortableRpcFetch,
  SolanaWatcherService,
} from '../src/services/solana-watcher'
import {
  deliveryStore,
  fixtureBase58,
  watch as deliveryWatch,
} from './helpers/wallet-delivery'

const WALLET = '11111111111111111111111111111112'
const MINT = 'So11111111111111111111111111111111111111112'
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const fixtureSignatures = new Map<string, string>()

type MutableWatcherSettings = {
  signatureBatchSize: number
  signatureMaxPages: number
}

async function withWatcherSettings<T>(
  overrides: Partial<MutableWatcherSettings>,
  run: () => Promise<T>,
): Promise<T> {
  const settings = config.watcher as unknown as MutableWatcherSettings
  const original = { ...settings }
  Object.assign(settings, overrides)
  try {
    return await run()
  } finally {
    Object.assign(settings, original)
  }
}

function signatureValue(value: string): string {
  const existing = fixtureSignatures.get(value)
  if (existing) return existing
  const encoded = fixtureBase58(fixtureSignatures.size + 1, 64)
  fixtureSignatures.set(value, encoded)
  return encoded
}

function signature(
  value: string,
  slot: number,
): ConfirmedSignatureInfo {
  return {
    signature: signatureValue(value),
    slot: BigInt(slot),
    err: null,
    memo: null,
    blockTime: BigInt(1_700_000_000 + slot) as ConfirmedSignatureInfo['blockTime'],
    confirmationStatus: 'confirmed',
  }
}

function tokenBalance(
  amount: string,
  decimals: number,
  accountIndex = 1,
): TokenBalance {
  const numericAmount = Number(amount)
  return {
    accountIndex,
    mint: MINT,
    owner: WALLET,
    programId: TOKEN_PROGRAM,
    uiTokenAmount: {
      amount,
      decimals,
      uiAmount: numericAmount / 10 ** decimals,
      uiAmountString: (numericAmount / 10 ** decimals).toString(),
    },
  }
}

function parsedTransaction({
  preLamports,
  postLamports,
  preTokens = [],
  postTokens = [],
}: {
  preLamports: bigint
  postLamports: bigint
  preTokens?: TokenBalance[]
  postTokens?: TokenBalance[]
}): ParsedTransactionWithMeta {
  return {
    slot: BigInt(42),
    blockTime: BigInt(1_700_000_042),
    version: 'legacy',
    transaction: {
      signatures: ['signature'],
      message: {
        accountKeys: [
          {
            pubkey: new PublicKey(WALLET),
            signer: true,
            writable: true,
            source: 'transaction',
          },
        ],
        instructions: [],
        recentBlockhash: '11111111111111111111111111111111',
        addressTableLookups: [],
      },
    },
    meta: {
      err: null,
      fee: BigInt(5_000),
      preBalances: [preLamports],
      postBalances: [postLamports],
      preTokenBalances: preTokens,
      postTokenBalances: postTokens,
      innerInstructions: [],
      logMessages: [],
      loadedAddresses: { writable: [], readonly: [] },
      rewards: [],
      computeUnitsConsumed: BigInt(1_500),
      returnData: null,
    },
  }
}

describe('SolanaWatcherService with @solana/web3.js 3.2.1 response shapes', () => {
  it('uses the real library PublicKey validation', () => {
    const watcher = new SolanaWatcherService()
    expect(watcher.isValidAddress(WALLET)).toBe(true)
    expect(watcher.isValidAddress('not-a-wallet')).toBe(false)
    expect(watcher.isValidAddress('')).toBe(false)
  })

  it('parses bigint lamport balances without coercing through number', () => {
    const watcher = new SolanaWatcherService()
    const movements = watcher.parseMovements(
      WALLET,
      'sol-signature',
      parsedTransaction({
        preLamports: BigInt(2_000_000_000),
        postLamports: BigInt(1_500_000_000),
      }),
    )

    expect(movements).toHaveLength(1)
    expect(movements[0]).toMatchObject({
      direction: 'out',
      lamports: BigInt(-500_000_000),
      signature: 'sol-signature',
    })
    expect(movements[0]?.summary).toContain('SOL out: 0.5000')
  })

  it('formats lamport changes above Number.MAX_SAFE_INTEGER exactly', () => {
    const watcher = new SolanaWatcherService()
    const movements = watcher.parseMovements(
      WALLET,
      'large-sol-signature',
      parsedTransaction({
        preLamports: BigInt(0),
        postLamports: BigInt('9007199254740993'),
      }),
    )

    expect(movements[0]?.lamports).toBe(BigInt('9007199254740993'))
    expect(movements[0]?.summary).toContain('SOL in: 9007199.2547')
  })

  it('parses typed SPL token balance changes for the watched wallet', () => {
    const watcher = new SolanaWatcherService()
    const movements = watcher.parseMovements(
      WALLET,
      'token-signature',
      parsedTransaction({
        preLamports: BigInt(1_000),
        postLamports: BigInt(1_000),
        preTokens: [tokenBalance('1000000', 6)],
        postTokens: [tokenBalance('2500000', 6)],
      }),
    )

    expect(movements).toHaveLength(1)
    expect(movements[0]).toMatchObject({
      direction: 'in',
      lamports: null,
      tokenMint: MINT,
      signature: 'token-signature',
    })
    expect(movements[0]?.summary).toContain('SPL in: 1.5000')
  })

  it('aggregates every owned token account before calculating a mint delta', () => {
    const watcher = new SolanaWatcherService()
    const movements = watcher.parseMovements(
      WALLET,
      'multi-account-token-signature',
      parsedTransaction({
        preLamports: BigInt(1_000),
        postLamports: BigInt(1_000),
        preTokens: [tokenBalance('1000', 6, 1), tokenBalance('0', 6, 2)],
        postTokens: [tokenBalance('0', 6, 1), tokenBalance('2500', 6, 2)],
      }),
    )

    expect(movements).toEqual([
      expect.objectContaining({
        direction: 'in',
        lamports: null,
        tokenMint: MINT,
        summary: expect.stringContaining('SPL in: 0.0015'),
      }),
    ])
  })

  it('does not report an outflow when owned token accounts only exchange balances', () => {
    const watcher = new SolanaWatcherService()
    const movements = watcher.parseMovements(
      WALLET,
      'internal-token-transfer-signature',
      parsedTransaction({
        preLamports: BigInt(1_000),
        postLamports: BigInt(1_000),
        preTokens: [tokenBalance('1000', 6, 1), tokenBalance('0', 6, 2)],
        postTokens: [tokenBalance('0', 6, 1), tokenBalance('1000', 6, 2)],
      }),
    )

    expect(movements).toEqual([{
      direction: 'unknown',
      lamports: null,
      signature: 'internal-token-transfer-signature',
      summary: 'Transaction detected (no balance change)',
    }])
  })

  it('passes real PublicKey and typed config to RPC-compatible methods and preserves cursor order', async () => {
    const watchedSignatures = [
      signature('newest', 4),
      signature('middle', 3),
      signature('oldest', 2),
      signature('cursor', 1),
    ]
    const transactions = new Map<string, ParsedTransactionWithMeta>([
      [
        signatureValue('oldest'),
        parsedTransaction({
          preLamports: BigInt(10),
          postLamports: BigInt(20),
        }),
      ],
      [
        signatureValue('middle'),
        parsedTransaction({
          preLamports: BigInt(20),
          postLamports: BigInt(15),
        }),
      ],
      [
        signatureValue('newest'),
        parsedTransaction({
          preLamports: BigInt(15),
          postLamports: BigInt(15),
        }),
      ],
    ])
    const signatureCalls: Array<{
      address: PublicKey
      options: unknown
    }> = []
    const transactionCalls: Array<{
      signature: string
      config: GetVersionedTransactionConfig
    }> = []

    const connection = {
      async getSignaturesForAddress(address, options) {
        signatureCalls.push({ address, options })
        return watchedSignatures
      },
      async getParsedTransaction(signatureValue, config) {
        transactionCalls.push({
          signature: signatureValue,
          config: config as GetVersionedTransactionConfig,
        })
        return transactions.get(signatureValue) ?? null
      },
    } satisfies Pick<
      Connection,
      'getSignaturesForAddress' | 'getParsedTransaction'
    >
    const watcher = new SolanaWatcherService(connection)

    const movements = await watcher.fetchNewMovements(
      WALLET,
      signatureValue('cursor'),
    )

    expect(signatureCalls).toHaveLength(1)
    expect(signatureCalls[0]?.address).toBeInstanceOf(PublicKey)
    expect(signatureCalls[0]?.address.toBase58()).toBe(WALLET)
    expect(signatureCalls[0]?.options).toEqual({ limit: 10 })
    expect(transactionCalls.map((call) => call.signature)).toEqual([
      signatureValue('oldest'),
      signatureValue('middle'),
      signatureValue('newest'),
    ])
    expect(transactionCalls[0]?.config).toEqual({
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 1,
    })
    expect(movements.map((movement) => movement.signature)).toEqual([
      signatureValue('oldest'),
      signatureValue('middle'),
      signatureValue('newest'),
    ])
    expect(movements.map((movement) => movement.lamports)).toEqual([
      BigInt(10),
      BigInt(-5),
      null,
    ])
  })

  it('batches catch-up transaction lookups in bounded chunks', async () => {
    await withWatcherSettings({ signatureMaxPages: 4 }, async () => {
      const pages = [
        Array.from({ length: 10 }, (_, index) =>
          signature(`page-a-${index}`, 40 - index),
        ),
        Array.from({ length: 10 }, (_, index) =>
          signature(`page-b-${index}`, 30 - index),
        ),
        Array.from({ length: 10 }, (_, index) =>
          signature(`page-c-${index}`, 20 - index),
        ),
        [signature('cursor', 1)],
      ]
      let page = 0
      const calls: string[][] = []
      const transaction = parsedTransaction({
        preLamports: BigInt(10),
        postLamports: BigInt(20),
      })
      const connection = {
        async getSignaturesForAddress() {
          return pages[page++] ?? []
        },
        async getParsedTransactions(signatureValues: string[]) {
          calls.push(signatureValues)
          return signatureValues.map(() => transaction)
        },
      }
      const watcher = new SolanaWatcherService(connection)

      const result = await watcher.fetchNewMovementsWithCursor(
        WALLET,
        signatureValue('cursor'),
      )

      expect(calls.map((call) => call.length)).toEqual([25, 5])
      expect(calls.flat()).toHaveLength(30)
      expect(result.movements).toHaveLength(30)
      expect(result.cursor).toBe(signatureValue('page-a-0'))
    })
  })

  it('keeps a readable transaction with unchanged balances as unknown activity', async () => {
    const unchanged = signature('unchanged-balances', 2)
    const cursor = signature('saved-before-unchanged', 1)
    const watcher = new SolanaWatcherService({
      getSignaturesForAddress: async () => [unchanged, cursor],
      getParsedTransaction: async () => parsedTransaction({
        preLamports: BigInt(10),
        postLamports: BigInt(10),
      }),
    })

    await expect(watcher.fetchNewMovementsWithCursor(WALLET, cursor.signature))
      .resolves.toEqual({
        movements: [{
          direction: 'unknown',
          lamports: null,
          signature: unchanged.signature,
          summary: 'Transaction detected (no balance change)',
        }],
        cursor: unchanged.signature,
      })
  })

  it('holds a batch with unavailable metadata and retries from the same cursor', async () => {
    const cursor = signatureValue('saved-before-missing')
    const newest = signatureValue('batch-newest')
    const transaction = parsedTransaction({
      preLamports: BigInt(10),
      postLamports: BigInt(20),
    })
    const getParsedTransactions = jest.fn()
      .mockResolvedValueOnce([null, transaction])
      .mockResolvedValueOnce([transaction, transaction])
    const watcher = new SolanaWatcherService({
      getSignaturesForAddress: async () => [
        signature('batch-newest', 3),
        signature('batch-oldest', 2),
        signature('saved-before-missing', 1),
      ],
      getParsedTransactions,
    })
    const row = deliveryWatch({ walletAddress: WALLET, lastSignature: cursor })
    const ledger = {
      ...deliveryStore(),
      listPendingIds: jest.fn().mockResolvedValue([]),
      listWatches: jest.fn().mockResolvedValue([row]),
      ingest: jest.fn().mockResolvedValue('ingested'),
      getHoldCounts: jest.fn().mockResolvedValue({ uncertain: 0, dispatching: 0 }),
    }
    const notify = jest.fn()

    await watcher.pollWatchlist(ledger, notify)

    expect(ledger.ingest).not.toHaveBeenCalled()
    expect(row.lastSignature).toBe(cursor)
    expect(notify).not.toHaveBeenCalled()

    await watcher.pollWatchlist(ledger, notify)

    expect(ledger.ingest).toHaveBeenCalledTimes(1)
    expect(ledger.ingest).toHaveBeenCalledWith(row, [
      expect.objectContaining({ signature: signatureValue('batch-oldest') }),
      expect.objectContaining({ signature: newest }),
    ], newest)
  })

  it('paginates back to the saved cursor before accepting newer signatures', async () => {
    const firstPage = Array.from({ length: 10 }, (_, index) =>
      signature(`new-${index}`, 30 - index),
    )
    const secondPage = [signature('old-new', 5), signature('cursor', 1)]
    const signatureCalls: unknown[] = []
    const connection = {
      async getSignaturesForAddress(_address, options) {
        signatureCalls.push(options)
        return signatureCalls.length === 1 ? firstPage : secondPage
      },
      async getParsedTransaction() {
        return parsedTransaction({
          preLamports: BigInt(10),
          postLamports: BigInt(10),
        })
      },
    } satisfies Pick<
      Connection,
      'getSignaturesForAddress' | 'getParsedTransaction'
    >
    const watcher = new SolanaWatcherService(connection)

    const result = await watcher.fetchNewMovementsWithCursor(
      WALLET,
      signatureValue('cursor'),
    )

    expect(signatureCalls).toEqual([
      { limit: 10 },
      { limit: 10, before: signatureValue('new-9') },
    ])
    expect(result.cursor).toBe(signatureValue('new-0'))
    expect(result.movements).toHaveLength(11)
  })

  it('fails closed when the RPC history window does not contain the saved cursor', async () => {
    const connection = {
      async getSignaturesForAddress() {
        return [signature('newer', 2)]
      },
      async getParsedTransaction() {
        return parsedTransaction({
          preLamports: BigInt(10),
          postLamports: BigInt(10),
        })
      },
    } satisfies Pick<
      Connection,
      'getSignaturesForAddress' | 'getParsedTransaction'
    >
    const watcher = new SolanaWatcherService(connection)

    await expect(
      watcher.fetchNewMovementsWithCursor(WALLET, signatureValue('pruned')),
    ).rejects.toThrow('Saved signature cursor was not found')
  })

  it('holds a saved cursor when the history budget is exhausted', async () => {
    await withWatcherSettings(
      { signatureBatchSize: 1, signatureMaxPages: 2 },
      async () => {
        const pages = [signature('newer-full-page', 2), signature('older-full-page', 1)]
        const getSignaturesForAddress = jest.fn()
          .mockResolvedValueOnce(pages.slice(0, 1))
          .mockResolvedValueOnce(pages.slice(1))
        const getParsedTransaction = jest.fn()
        const watcher = new SolanaWatcherService({
          getSignaturesForAddress,
          getParsedTransaction,
        })
        const saved = signatureValue('saved-full-pages')
        const watch = deliveryWatch({ walletAddress: WALLET, lastSignature: saved })
        const ledger = {
          ...deliveryStore(),
          listPendingIds: jest.fn().mockResolvedValue([]),
          listWatches: jest.fn().mockResolvedValue([watch]),
          ingest: jest.fn(),
          getHoldCounts: jest.fn().mockResolvedValue({ uncertain: 0, dispatching: 0 }),
        }

        await watcher.pollWatchlist(ledger, jest.fn())

        expect(getSignaturesForAddress).toHaveBeenCalledTimes(2)
        expect(getSignaturesForAddress).toHaveBeenLastCalledWith(expect.anything(), {
          before: pages[0]!.signature,
          limit: 1,
        })
        expect(getParsedTransaction).not.toHaveBeenCalled()
        expect(ledger.ingest).not.toHaveBeenCalled()
        expect(watch.lastSignature).toBe(saved)
      },
    )
  })

  it('rejects duplicate signatures after the saved cursor before advancing', async () => {
    const connection = {
      async getSignaturesForAddress() {
        return [
          signature('new', 3),
          signature('cursor', 2),
          signature('cursor', 1),
        ]
      },
      async getParsedTransaction() {
        return parsedTransaction({
          preLamports: BigInt(10),
          postLamports: BigInt(10),
        })
      },
    } satisfies Pick<
      Connection,
      'getSignaturesForAddress' | 'getParsedTransaction'
    >
    const watcher = new SolanaWatcherService(connection)

    await expect(
      watcher.fetchNewMovementsWithCursor(WALLET, signatureValue('cursor')),
    ).rejects.toThrow('Wallet history returned a repeated signature')
  })

  it('rejects overlapping RPC pages even when the saved cursor is reached', async () => {
    const firstPage = Array.from({ length: 10 }, (_, index) =>
      signature(`new-${index}`, 30 - index),
    )
    const connection = {
      async getSignaturesForAddress(_address, options) {
        return options?.before
          ? [signature('old-new', 5), signature('cursor', 1), firstPage[5]!]
          : firstPage
      },
      async getParsedTransaction() {
        return parsedTransaction({
          preLamports: BigInt(10),
          postLamports: BigInt(10),
        })
      },
    } satisfies Pick<
      Connection,
      'getSignaturesForAddress' | 'getParsedTransaction'
    >
    const watcher = new SolanaWatcherService(connection)

    await expect(
      watcher.fetchNewMovementsWithCursor(WALLET, signatureValue('cursor')),
    ).rejects.toThrow('Wallet history returned a repeated signature')
  })

  it('rejects malformed signature pages before parsing transactions', async () => {
    const getParsedTransaction = jest.fn()
    const connection = {
      async getSignaturesForAddress() {
        return [null]
      },
      getParsedTransaction,
    } as never
    const watcher = new SolanaWatcherService(connection)

    await expect(
      watcher.fetchNewMovementsWithCursor(WALLET, null),
    ).rejects.toThrow('Wallet history returned a malformed signature page')
    expect(getParsedTransaction).not.toHaveBeenCalled()
  })

})


describe('bounded wallet history reads', () => {
  const wallet = fixtureBase58(2, 32)
  const signatureFor = signatureValue
  const signature = (value: string) => ({ signature: signatureFor(value) })
  const page = (...values: string[]) => values.map(signature)
  const fullPage = (prefix: string) =>
    Array.from({ length: 10 }, (_, index) => `${prefix}-${index}`)
  const parsed = {
    meta: { preBalances: [], postBalances: [] },
    transaction: { message: { accountKeys: [] } },
  }

  const fixture = () => {
    const rpc = {
      getSignaturesForAddress: jest.fn(),
      getParsedTransaction: jest.fn().mockResolvedValue(parsed),
    }
    const service = new SolanaWatcherService(rpc as never)
    return { rpc, service }
  }

  it.each([null, { ...parsed, meta: null }])(
    'holds newer movements when the oldest transaction is unavailable: %p',
    async (unavailable) => {
      const { rpc, service } = fixture()
      rpc.getSignaturesForAddress.mockResolvedValue(page('newer', 'older', 'cursor'))
      rpc.getParsedTransaction.mockResolvedValueOnce(unavailable)
      await expect(service.fetchNewMovements(wallet, signatureFor('cursor')))
        .rejects.toMatchObject({ code: 'transaction-unavailable' })
      expect(rpc.getParsedTransaction).toHaveBeenCalledTimes(1)
    },
  )

  it('reaches a cursor beyond the first page before returning oldest-first data', async () => {
    const { rpc, service } = fixture()
    const first = fullPage('first')
    rpc.getSignaturesForAddress
      .mockResolvedValueOnce(page(...first))
      .mockResolvedValueOnce(page('older', 'cursor', 'before-cursor'))
    const result = await service.fetchNewMovements(wallet, signatureFor('cursor'))
    expect(result.map((movement) => movement.signature)).toEqual([
      'older',
      ...first.toReversed(),
    ].map(signatureFor))
    expect(rpc.getSignaturesForAddress).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      { limit: 10, before: signatureFor('first-9') },
    )
    expect(rpc.getParsedTransaction).not.toHaveBeenCalledWith(
      signatureFor('cursor'),
      expect.anything(),
    )
    expect(rpc.getParsedTransaction).toHaveBeenCalledWith(signatureFor('older'), {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 1,
    })
  })

  it('holds a stored cursor missing from exhausted provider history', async () => {
    const { rpc, service } = fixture()
    rpc.getSignaturesForAddress.mockResolvedValue(page('newer'))
    await expect(service.fetchNewMovements(wallet, signatureFor('cursor'))).rejects.toThrow()
    expect(rpc.getParsedTransaction).not.toHaveBeenCalled()
  })

  it('holds repeated pages instead of silently losing an older interval', async () => {
    const { rpc, service } = fixture()
    rpc.getSignaturesForAddress.mockResolvedValue(page(...fullPage('same')))
    await expect(service.fetchNewMovements(wallet, signatureFor('cursor'))).rejects.toThrow()
    expect(rpc.getSignaturesForAddress).toHaveBeenCalledTimes(2)
    expect(rpc.getParsedTransaction).not.toHaveBeenCalled()
  })

  it('holds an RPC error on a later page without returning the first page', async () => {
    const { rpc, service } = fixture()
    rpc.getSignaturesForAddress
      .mockResolvedValueOnce(page(...fullPage('first')))
      .mockRejectedValueOnce(new Error('synthetic RPC error'))
    await expect(service.fetchNewMovements(wallet, signatureFor('cursor'))).rejects.toThrow()
    expect(rpc.getParsedTransaction).not.toHaveBeenCalled()
  })

  it('holds after five full pages without an established boundary', async () => {
    const { rpc, service } = fixture()
    let index = 0
    rpc.getSignaturesForAddress.mockImplementation(async () =>
      page(...fullPage(`page${index++}`)),
    )
    await expect(service.fetchNewMovements(wallet, signatureFor('cursor')))
      .rejects.toMatchObject({ code: 'pagination-budget' })
    expect(rpc.getSignaturesForAddress).toHaveBeenCalledTimes(5)
    expect(rpc.getParsedTransaction).not.toHaveBeenCalled()
  })

  it('bootstraps a full recent page without requiring older provider history', async () => {
    const { rpc, service } = fixture()
    const first = fullPage('first')
    rpc.getSignaturesForAddress
      .mockResolvedValueOnce(page(...first))
      .mockResolvedValueOnce(page('oldest'))
    const result = await service.fetchNewMovements(wallet, null)
    expect(result.map((movement) => movement.signature)).toEqual(first.toReversed().map(signatureFor))
    expect(rpc.getSignaturesForAddress).toHaveBeenCalledTimes(1)
    expect(rpc.getParsedTransaction).not.toHaveBeenCalledWith(signatureFor('oldest'), expect.anything())
  })

  it('holds the initial cursor when the first-watch page has missing metadata', async () => {
    const { rpc, service } = fixture()
    rpc.getSignaturesForAddress.mockResolvedValue(page('newer', 'older'))
    rpc.getParsedTransaction.mockResolvedValueOnce(null)
    await expect(service.fetchNewMovements(wallet, null))
      .rejects.toMatchObject({ code: 'transaction-unavailable' })
    expect(rpc.getSignaturesForAddress).toHaveBeenCalledTimes(1)
    expect(rpc.getParsedTransaction).toHaveBeenCalledTimes(1)
  })

  it('holds a parsed prefix when a later transaction is unavailable', async () => {
    const { rpc, service } = fixture()
    rpc.getSignaturesForAddress.mockResolvedValue(page('newer', 'older', 'cursor'))
    rpc.getParsedTransaction.mockResolvedValueOnce(parsed).mockResolvedValueOnce(null)
    await expect(service.fetchNewMovements(wallet, signatureFor('cursor')))
      .rejects.toMatchObject({ code: 'transaction-unavailable' })
    expect(rpc.getParsedTransaction).toHaveBeenCalledTimes(2)
  })

  it('holds a transaction RPC failure without exposing upstream details', async () => {
    const { rpc, service } = fixture()
    rpc.getSignaturesForAddress.mockResolvedValue(page('newer', 'cursor'))
    rpc.getParsedTransaction.mockRejectedValue(new Error('synthetic upstream detail'))
    await expect(service.fetchNewMovements(wallet, signatureFor('cursor'))).rejects.toMatchObject({
      code: 'rpc-failure',
      message: 'Wallet history unavailable: rpc-failure',
    })
  })

  it('aborts the underlying transport request when an RPC deadline expires', async () => {
    let requestSignal: AbortSignal | undefined
    const fetchMock = jest.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        requestSignal = init?.signal ?? undefined
        if (!requestSignal) {
          reject(new Error('RPC transport did not receive an abort signal'))
          return
        }
        requestSignal.addEventListener(
          'abort',
          () => reject(new Error('RPC transport aborted')),
          { once: true },
        )
      }))
    const connection = new Connection('http://127.0.0.1:8899', {
      commitment: 'confirmed',
      fetch: createAbortableRpcFetch(fetchMock as typeof globalThis.fetch),
    })
    const watcher = new SolanaWatcherService(connection, 20)

    await expect(watcher.fetchNewMovements(wallet, null)).rejects.toMatchObject({
      code: 'rpc-timeout',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestSignal?.aborted).toBe(true)
  })

  it('deadline-bounds a stalled RPC read and retries it on the next poll', async () => {
    const signature = signatureFor('stalled-then-fresh')
    const getSignaturesForAddress = jest.fn()
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce([{ signature }])
    const getParsedTransaction = jest.fn().mockResolvedValue({
      meta: { preBalances: [BigInt(1)], postBalances: [BigInt(2)] },
      transaction: { message: { accountKeys: [] } },
    })
    const watcher = new SolanaWatcherService({
      getSignaturesForAddress,
      getParsedTransaction,
    }, 20)
    const watch = deliveryWatch({ walletAddress: wallet, lastSignature: null })
    const ledger = {
      ...deliveryStore(),
      listPendingIds: jest.fn().mockResolvedValue([]),
      listWatches: jest.fn().mockResolvedValue([watch]),
      ingest: jest.fn().mockResolvedValue('ingested'),
      getHoldCounts: jest.fn().mockResolvedValue({ uncertain: 0, dispatching: 0 }),
    }

    await watcher.pollWatchlist(ledger, jest.fn())
    expect(ledger.ingest).not.toHaveBeenCalled()

    await watcher.pollWatchlist(ledger, jest.fn())
    expect(getSignaturesForAddress).toHaveBeenCalledTimes(2)
    expect(ledger.ingest).toHaveBeenCalledTimes(1)
  })

  it.each([[], page('newer')].map((value) => ({ value })))('holds a missing stored cursor on a terminal page: %p', async ({ value }) => {
    const { rpc, service } = fixture()
    rpc.getSignaturesForAddress.mockResolvedValue(value)
    await expect(service.fetchNewMovements(wallet, signatureFor('cursor'))).rejects.toMatchObject({
      code: 'cursor-not-found',
    })
    expect(rpc.getParsedTransaction).not.toHaveBeenCalled()
  })

  it('accepts an unchanged cursor without fetching old transactions', async () => {
    const { rpc, service } = fixture()
    rpc.getSignaturesForAddress.mockResolvedValue(page('cursor', 'older'))
    await expect(service.fetchNewMovements(wallet, signatureFor('cursor'))).resolves.toEqual([])
    expect(rpc.getParsedTransaction).not.toHaveBeenCalled()
  })

  it('bootstraps empty or full first-watch windows without a second page', async () => {
    const { rpc, service } = fixture()
    rpc.getSignaturesForAddress.mockResolvedValueOnce([])
    await expect(service.fetchNewMovements(wallet, undefined)).resolves.toEqual([])
    const first = fullPage('first')
    rpc.getSignaturesForAddress
      .mockResolvedValueOnce(page(...first))
      .mockResolvedValueOnce([])
    const result = await service.fetchNewMovements(wallet, null)
    expect(result.map((movement) => movement.signature)).toEqual(first.toReversed().map(signatureFor))
    expect(rpc.getSignaturesForAddress).toHaveBeenCalledTimes(2)
  })

  it.each(['', ' ', '0'.repeat(88), 'O'.repeat(88), '1'.repeat(89), '1'.repeat(63), '1'.repeat(65), 'z'.repeat(88)])('holds an invalid saved cursor rather than bootstrapping: %p', async (cursor) => {
    const { rpc, service } = fixture()
    await expect(service.fetchNewMovements(wallet, cursor)).rejects.toMatchObject({
      code: 'invalid-cursor',
    })
    expect(rpc.getSignaturesForAddress).not.toHaveBeenCalled()
  })

  it('rejects overlapping pages even when the final cursor advances', async () => {
    const { rpc, service } = fixture()
    rpc.getSignaturesForAddress
      .mockResolvedValueOnce(page(...fullPage('first')))
      .mockResolvedValueOnce(page('first-5', 'older', 'cursor'))
    await expect(service.fetchNewMovements(wallet, signatureFor('cursor'))).rejects.toMatchObject({
      code: 'repeated-signature',
    })
    expect(rpc.getParsedTransaction).not.toHaveBeenCalled()
  })

  it('rejects duplicate rows after the saved cursor on a terminal page', async () => {
    const { rpc, service } = fixture()
    rpc.getSignaturesForAddress.mockResolvedValue(page('newer', 'cursor', 'cursor'))
    await expect(service.fetchNewMovements(wallet, signatureFor('cursor'))).rejects.toMatchObject({
      code: 'repeated-signature',
    })
    expect(rpc.getParsedTransaction).not.toHaveBeenCalled()
  })

  it('rejects cross-page overlaps after the saved cursor', async () => {
    const { rpc, service } = fixture()
    rpc.getSignaturesForAddress
      .mockResolvedValueOnce(page(...fullPage('first')))
      .mockResolvedValueOnce(page('older', 'cursor', 'first-5'))
    await expect(service.fetchNewMovements(wallet, signatureFor('cursor'))).rejects.toMatchObject({
      code: 'repeated-signature',
    })
    expect(rpc.getParsedTransaction).not.toHaveBeenCalled()
  })

  it('accepts a cursor found on the fifth and final permitted page', async () => {
    const { rpc, service } = fixture()
    for (let index = 0; index < 4; index++) {
      rpc.getSignaturesForAddress.mockResolvedValueOnce(page(...fullPage(`page${index}`)))
    }
    rpc.getSignaturesForAddress.mockResolvedValueOnce(page('cursor'))
    expect(await service.fetchNewMovements(wallet, signatureFor('cursor'))).toHaveLength(40)
    expect(rpc.getSignaturesForAddress).toHaveBeenCalledTimes(5)
  })

  it.each([null, {}, [null], [{}], [{ signature: '' }], [{ signature: ' ' }], [{ signature: '0'.repeat(88) }], [{ signature: '1'.repeat(89) }], [{ signature: '1'.repeat(63) }], [{ signature: '1'.repeat(65) }], [{ signature: 42 }], page(...fullPage('too-many'), 'extra')].map((value) => ({ value })))(
    'holds malformed or over-limit signature pages: %p',
    async ({ value }) => {
      const { rpc, service } = fixture()
      rpc.getSignaturesForAddress.mockResolvedValue(value)
      await expect(service.fetchNewMovements(wallet, signatureFor('cursor'))).rejects.toMatchObject({
        code: 'invalid-signature-page',
      })
      expect(rpc.getParsedTransaction).not.toHaveBeenCalled()
    },
  )

  it.each([0, -1, 1.5, Number.NaN, 1001])('rejects invalid page config: %p', async (value) => {
    const { rpc, service } = fixture()
    const override = jest.replaceProperty(config.watcher, 'signatureBatchSize', value)
    try {
      await expect(service.fetchNewMovements(wallet, null)).rejects.toMatchObject({
        code: 'invalid-page-size',
      })
      expect(rpc.getSignaturesForAddress).not.toHaveBeenCalled()
    } finally {
      override.restore()
    }
  })

  it('caps an RPC-valid configured page size to 100 rows', async () => {
    const { rpc, service } = fixture()
    const override = jest.replaceProperty(config.watcher, 'signatureBatchSize', 1000)
    try {
      rpc.getSignaturesForAddress.mockResolvedValue(page('cursor'))
      await service.fetchNewMovements(wallet, signatureFor('cursor'))
      expect(rpc.getSignaturesForAddress).toHaveBeenCalledWith(expect.anything(), { limit: 100 })
    } finally {
      override.restore()
    }
  })


  it('accepts canonical 64-byte signatures with and without leading zero bytes', async () => {
    const { rpc, service } = fixture()
    const signatures = ['2'.repeat(88), '1'.repeat(64)]
    rpc.getSignaturesForAddress.mockResolvedValue(
      signatures.map((signature) => ({ signature })),
    )
    const result = await service.fetchNewMovements(wallet, null)
    expect(result.map((movement) => movement.signature)).toEqual(signatures.toReversed())
  })

})
