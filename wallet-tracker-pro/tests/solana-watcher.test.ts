/**
 * @jest-environment node
 */
jest.mock('../src/lib/config', () => ({
  config: {
    solana: { rpcUrl: 'http://localhost', commitment: 'confirmed' },
    watcher: { signatureBatchSize: 10, signatureMaxPages: 2 },
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
import { SolanaWatcherService } from '../src/services/solana-watcher'

const WALLET = '11111111111111111111111111111112'
const MINT = 'So11111111111111111111111111111111111111112'
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

function signature(
  value: string,
  slot: number,
): ConfirmedSignatureInfo {
  return {
    signature: value,
    slot: BigInt(slot),
    err: null,
    memo: null,
    blockTime: BigInt(1_700_000_000 + slot),
    confirmationStatus: 'confirmed',
  }
}

function tokenBalance(amount: string, decimals: number): TokenBalance {
  const numericAmount = Number(amount)
  return {
    accountIndex: 1,
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

  it('passes real PublicKey and typed config to RPC-compatible methods and preserves cursor order', async () => {
    const watchedSignatures = [
      signature('newest', 4),
      signature('middle', 3),
      signature('oldest', 2),
      signature('cursor', 1),
    ]
    const transactions = new Map<string, ParsedTransactionWithMeta>([
      [
        'oldest',
        parsedTransaction({
          preLamports: BigInt(10),
          postLamports: BigInt(20),
        }),
      ],
      [
        'middle',
        parsedTransaction({
          preLamports: BigInt(20),
          postLamports: BigInt(15),
        }),
      ],
      [
        'newest',
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

    const movements = await watcher.fetchNewMovements(WALLET, 'cursor')

    expect(signatureCalls).toHaveLength(1)
    expect(signatureCalls[0]?.address).toBeInstanceOf(PublicKey)
    expect(signatureCalls[0]?.address.toBase58()).toBe(WALLET)
    expect(signatureCalls[0]?.options).toEqual({ limit: 10 })
    expect(transactionCalls.map((call) => call.signature)).toEqual([
      'oldest',
      'middle',
      'newest',
    ])
    expect(transactionCalls[0]?.config).toEqual({
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 1,
    })
    expect(movements.map((movement) => movement.signature)).toEqual([
      'oldest',
      'middle',
      'newest',
    ])
    expect(movements.map((movement) => movement.lamports)).toEqual([
      BigInt(10),
      BigInt(-5),
      null,
    ])
  })

  it('batches catch-up transaction lookups in bounded chunks', async () => {
    const originalMaxPages = config.watcher.signatureMaxPages
    config.watcher.signatureMaxPages = 4
    try {
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

      const result = await watcher.fetchNewMovementsWithCursor(WALLET, 'cursor')

      expect(calls.map((call) => call.length)).toEqual([25, 5])
      expect(calls.flat()).toHaveLength(30)
      expect(result.movements).toHaveLength(30)
      expect(result.cursor).toBe('page-a-0')
    } finally {
      config.watcher.signatureMaxPages = originalMaxPages
    }
  })

  it('fails without advancing when a confirmed transaction is unavailable', async () => {
    const connection = {
      async getSignaturesForAddress() {
        return [signature('missing', 2)]
      },
      async getParsedTransaction() {
        return null
      },
    } satisfies Pick<
      Connection,
      'getSignaturesForAddress' | 'getParsedTransaction'
    >
    const watcher = new SolanaWatcherService(connection)

    await expect(
      watcher.fetchNewMovementsWithCursor(WALLET, null),
    ).rejects.toThrow('Confirmed transaction is not yet available: missing')
  })

  it('does not advance watchlist state after an unavailable transaction', async () => {
    const connection = {
      async getSignaturesForAddress() {
        return [signature('missing', 2)]
      },
      async getParsedTransaction() {
        return null
      },
    } satisfies Pick<
      Connection,
      'getSignaturesForAddress' | 'getParsedTransaction'
    >
    const commitWatchProgress = jest.fn()
    const claimPendingNotifications = jest.fn(async () => [])
    const releaseNotificationClaim = jest.fn()
    const markNotificationDelivered = jest.fn()
    const database = {
      async listActiveWatches() {
        return [
          {
            id: 1,
            walletAddress: WALLET,
            lastSignature: null,
            label: null,
            subscriber: { chatId: 'chat-1' },
          },
        ]
      },
      commitWatchProgress,
      claimPendingNotifications,
      releaseNotificationClaim,
      markNotificationDelivered,
    }
    const watcher = new SolanaWatcherService(connection)
    const notify = jest.fn()

    await watcher.pollWatchlist(database as never, notify)
    await watcher.pollWatchlist(database as never, notify)

    expect(commitWatchProgress).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
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

    const result = await watcher.fetchNewMovementsWithCursor(WALLET, 'cursor')

    expect(signatureCalls).toEqual([
      { limit: 10 },
      { limit: 10, before: 'new-9' },
    ])
    expect(result.cursor).toBe('new-0')
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
      watcher.fetchNewMovementsWithCursor(WALLET, 'pruned'),
    ).rejects.toThrow('Saved signature cursor was not found')
  })

  it('rebases an unavailable saved cursor explicitly before advancing again', async () => {
    const connection = {
      async getSignaturesForAddress() {
        return [signature('newer', 2)]
      },
      async getParsedTransaction() {
        return parsedTransaction({
          preLamports: BigInt(10),
          postLamports: BigInt(20),
        })
      },
    } satisfies Pick<
      Connection,
      'getSignaturesForAddress' | 'getParsedTransaction'
    >
    const watch = {
      id: 'watch-1',
      walletAddress: WALLET,
      lastSignature: 'pruned' as string | null,
      label: null,
      subscriber: { chatId: 'chat-1' },
    }
    const resetWatchCursor = jest.fn(async () => {
      watch.lastSignature = null
    })
    const commitWatchProgress = jest.fn(async (input) => {
      watch.lastSignature = input.cursor
    })
    const database = {
      async listActiveWatches() {
        return [watch]
      },
      resetWatchCursor,
      commitWatchProgress,
      claimPendingNotifications: jest.fn(async () => []),
      releaseNotificationClaim: jest.fn(),
      markNotificationDelivered: jest.fn(),
    }
    const watcher = new SolanaWatcherService(connection)

    await watcher.pollWatchlist(database as never, jest.fn())

    expect(resetWatchCursor).toHaveBeenCalledWith('watch-1')
    expect(commitWatchProgress).toHaveBeenCalledWith(
      expect.objectContaining({ watchId: 'watch-1', cursor: 'newer' }),
    )
    expect(watch.lastSignature).toBe('newer')
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
      watcher.fetchNewMovementsWithCursor(WALLET, 'cursor'),
    ).rejects.toThrow('Wallet history returned a repeated signature')
  })

  it('rejects overlapping RPC pages even when the saved cursor is reached', async () => {
    const firstPage = Array.from({ length: 10 }, (_, index) =>
      signature(`new-${index}`, 30 - index),
    )
    const connection = {
      async getSignaturesForAddress(_address, options) {
        return options.before
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
      watcher.fetchNewMovementsWithCursor(WALLET, 'cursor'),
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

  it('commits movements and the notification outbox before delivery', async () => {
    const connection = {
      async getSignaturesForAddress() {
        return [signature('new', 2)]
      },
      async getParsedTransaction() {
        return parsedTransaction({
          preLamports: BigInt(10),
          postLamports: BigInt(20),
        })
      },
    } satisfies Pick<
      Connection,
      'getSignaturesForAddress' | 'getParsedTransaction'
    >
    let pending: Array<{
      id: string
      message: string
      claimToken: string | null
    }> = []
    const events: string[] = []
    const commitWatchProgress = jest.fn(async (input) => {
      events.push('commit')
      pending = input.notifications.map(
        (notification: { signature: string; message: string }) => ({
          id: `notification-${notification.signature}`,
          message: notification.message,
          claimToken: null,
        }),
      )
    })
    const claimPendingNotifications = jest.fn(async () => {
      return pending.map((notification) => {
        notification.claimToken = `claim-${notification.id}`
        return notification
      })
    })
    const releaseNotificationClaim = jest.fn(
      async (id: string, claimToken: string) => {
        pending = pending.map((notification) =>
          notification.id === id &&
          notification.claimToken === claimToken
            ? { ...notification, claimToken: null }
            : notification,
        )
      },
    )
    const markNotificationDelivered = jest.fn(
      async (id: string, claimToken: string) => {
        events.push(`delivered:${id}`)
        pending = pending.filter(
          (notification) =>
            notification.id !== id ||
            notification.claimToken !== claimToken,
        )
      },
    )
    const database = {
      async listActiveWatches() {
        return [
          {
            id: 'watch-1',
            walletAddress: WALLET,
            lastSignature: null,
            label: 'Main',
            subscriber: { chatId: 'chat-1' },
          },
        ]
      },
      commitWatchProgress,
      claimPendingNotifications,
      releaseNotificationClaim,
      markNotificationDelivered,
    }
    const watcher = new SolanaWatcherService(connection)
    const notify = jest.fn(async () => {
      events.push('notify')
    })

    await watcher.pollWatchlist(database as never, notify)

    expect(commitWatchProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        watchId: 'watch-1',
        cursor: 'new',
        movements: [
          expect.objectContaining({
            walletAddress: WALLET,
            signature: 'new',
            direction: 'in',
            lamports: BigInt(10),
          }),
        ],
        notifications: [
          expect.objectContaining({
            signature: 'new',
          }),
        ],
      }),
    )
    expect(notify).toHaveBeenCalledWith(
      'chat-1',
      expect.stringContaining('[Main] Wallet activity'),
    )
    expect(events).toEqual(['commit', 'notify', 'delivered:notification-new'])
  })

  it('retries a failed notification without blocking or duplicating progress', async () => {
    const connection = {
      async getSignaturesForAddress() {
        return [signature('new', 2)]
      },
      async getParsedTransaction() {
        return parsedTransaction({
          preLamports: BigInt(10),
          postLamports: BigInt(20),
        })
      },
    } satisfies Pick<
      Connection,
      'getSignaturesForAddress' | 'getParsedTransaction'
    >
    const watch = {
      id: 'watch-1',
      walletAddress: WALLET,
      lastSignature: null as string | null,
      label: null,
      subscriber: { chatId: 'chat-1' },
    }
    let pending: Array<{
      id: string
      message: string
      claimToken: string | null
    }> = []
    const commitWatchProgress = jest.fn(async (input) => {
      watch.lastSignature = input.cursor
      pending = input.notifications.map(
        (notification: { signature: string; message: string }) => ({
          id: `notification-${notification.signature}`,
          message: notification.message,
          claimToken: null,
        }),
      )
    })
    const claimPendingNotifications = jest.fn(async () => {
      return pending.map((notification) => {
        notification.claimToken = `claim-${notification.id}`
        return notification
      })
    })
    const releaseNotificationClaim = jest.fn(
      async (id: string, claimToken: string) => {
        pending = pending.map((notification) =>
          notification.id === id &&
          notification.claimToken === claimToken
            ? { ...notification, claimToken: null }
            : notification,
        )
      },
    )
    const markNotificationDelivered = jest.fn(
      async (id: string, claimToken: string) => {
        pending = pending.filter(
          (notification) =>
            notification.id !== id ||
            notification.claimToken !== claimToken,
        )
      },
    )
    const database = {
      async listActiveWatches() {
        return [watch]
      },
      commitWatchProgress,
      claimPendingNotifications,
      releaseNotificationClaim,
      markNotificationDelivered,
    }
    const watcher = new SolanaWatcherService(connection)
    const notify = jest
      .fn<Promise<void>, [string, string]>()
      .mockRejectedValueOnce(new Error('telegram unavailable'))
      .mockResolvedValueOnce(undefined)

    await watcher.pollWatchlist(database as never, notify)

    expect(watch.lastSignature).toBe('new')
    expect(commitWatchProgress).toHaveBeenCalledTimes(1)
    expect(pending).toHaveLength(1)
    expect(pending[0]?.claimToken).toBeNull()

    await watcher.pollWatchlist(database as never, notify)

    expect(commitWatchProgress).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledTimes(2)
    expect(markNotificationDelivered).toHaveBeenCalledTimes(1)
    expect(pending).toEqual([])
  })

  it('delivers later notifications when the first claimed delivery fails', async () => {
    const connection = {
      async getSignaturesForAddress() {
        return []
      },
    } satisfies Pick<Connection, 'getSignaturesForAddress'>
    let pending = [
      { id: 'first', message: 'first', claimToken: null as string | null },
      { id: 'second', message: 'second', claimToken: null as string | null },
    ]
    const claimPendingNotifications = jest.fn(async () =>
      pending.map((notification) => {
        notification.claimToken = `claim-${notification.id}`
        return notification
      }),
    )
    const releaseNotificationClaim = jest.fn(
      async (id: string, claimToken: string) => {
        pending = pending.map((notification) =>
          notification.id === id &&
          notification.claimToken === claimToken
            ? { ...notification, claimToken: null }
            : notification,
        )
      },
    )
    const markNotificationDelivered = jest.fn(
      async (id: string, claimToken: string) => {
        pending = pending.filter(
          (notification) =>
            notification.id !== id ||
            notification.claimToken !== claimToken,
        )
      },
    )
    const database = {
      async listActiveWatches() {
        return [
          {
            id: 'watch-1',
            walletAddress: WALLET,
            lastSignature: null,
            label: null,
            subscriber: { chatId: 'chat-1' },
          },
        ]
      },
      commitWatchProgress: jest.fn(),
      claimPendingNotifications,
      releaseNotificationClaim,
      markNotificationDelivered,
    }
    const notify = jest.fn(async (_chatId: string, message: string) => {
      if (message === 'first') {
        throw new Error('telegram unavailable')
      }
    })
    const watcher = new SolanaWatcherService(connection)

    await watcher.pollWatchlist(database as never, notify)

    expect(notify).toHaveBeenCalledTimes(2)
    expect(releaseNotificationClaim).toHaveBeenCalledWith(
      'first',
      'claim-first',
    )
    expect(markNotificationDelivered).toHaveBeenCalledWith(
      'second',
      'claim-second',
    )
    expect(pending).toEqual([
      { id: 'first', message: 'first', claimToken: null },
    ])
  })

  it('retries the same signatures when the atomic progress commit fails', async () => {
    const connection = {
      async getSignaturesForAddress() {
        return [signature('retry-me', 2)]
      },
      async getParsedTransaction() {
        return parsedTransaction({
          preLamports: BigInt(10),
          postLamports: BigInt(20),
        })
      },
    } satisfies Pick<
      Connection,
      'getSignaturesForAddress' | 'getParsedTransaction'
    >
    const watch = {
      id: 'watch-1',
      walletAddress: WALLET,
      lastSignature: null as string | null,
      label: null,
      subscriber: { chatId: 'chat-1' },
    }
    const commitWatchProgress = jest
      .fn<Promise<void>, [{ cursor: string }]>()
      .mockRejectedValueOnce(new Error('transaction rolled back'))
      .mockImplementationOnce(async (input) => {
        watch.lastSignature = input.cursor
      })
    const database = {
      async listActiveWatches() {
        return [watch]
      },
      commitWatchProgress,
      claimPendingNotifications: jest.fn(async () => []),
      releaseNotificationClaim: jest.fn(),
      markNotificationDelivered: jest.fn(),
    }
    const watcher = new SolanaWatcherService(connection)

    await watcher.pollWatchlist(database as never, jest.fn())
    expect(watch.lastSignature).toBeNull()

    await watcher.pollWatchlist(database as never, jest.fn())
    expect(watch.lastSignature).toBe('retry-me')
    expect(commitWatchProgress).toHaveBeenCalledTimes(2)
    expect(commitWatchProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'retry-me' }),
    )
  })

  it('serializes overlapping poll cycles', async () => {
    let resolveSignatures: (
      value: ConfirmedSignatureInfo[],
    ) => void = () => undefined
    const signatures = new Promise<ConfirmedSignatureInfo[]>((resolve) => {
      resolveSignatures = resolve
    })
    const listActiveWatches = jest.fn(async () => [
      {
        id: 'watch-1',
        walletAddress: WALLET,
        lastSignature: null,
        label: null,
        subscriber: { chatId: 'chat-1' },
      },
    ])
    const getSignaturesForAddress = jest.fn(async () => signatures)
    const connection = {
      getSignaturesForAddress,
      async getParsedTransaction() {
        return null
      },
    } satisfies Pick<
      Connection,
      'getSignaturesForAddress' | 'getParsedTransaction'
    >
    const database = {
      listActiveWatches,
      commitWatchProgress: jest.fn(),
      claimPendingNotifications: jest.fn(async () => []),
      releaseNotificationClaim: jest.fn(),
      markNotificationDelivered: jest.fn(),
    }
    const watcher = new SolanaWatcherService(connection)

    const first = watcher.pollWatchlist(database as never, jest.fn())
    const second = watcher.pollWatchlist(database as never, jest.fn())
    expect(second).toBe(first)
    resolveSignatures([])
    await Promise.all([first, second])

    expect(listActiveWatches).toHaveBeenCalledTimes(1)
    expect(getSignaturesForAddress).toHaveBeenCalledTimes(1)
  })
})
