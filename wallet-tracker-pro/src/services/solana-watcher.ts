import {
  Connection,
  PublicKey,
  type ConfirmedSignatureInfo,
  type ParsedTransactionWithMeta,
  type TokenBalance,
} from '@solana/web3.js'
import { config } from '../lib/config'
import { logger } from '../lib/logger'
import {
  dispatchPendingDeliveries,
  DELIVERY_BATCH_SIZE,
  MAX_INGESTION_MOVEMENTS,
  WalletIngestionError,
  type DeliveryReceipt,
  type DeliveryStore,
  type DeliveryWatch,
} from './wallet-delivery-ledger'

export interface WalletMovement {
  direction: 'in' | 'out' | 'unknown'
  lamports: bigint | null
  signature: string
  summary: string
  tokenMint?: string
}

export interface WalletPollingStore extends DeliveryStore {
  listWatches(afterId: string, limit: number): Promise<Array<DeliveryWatch>>
  ingest(
    watch: DeliveryWatch,
    movements: ReadonlyArray<WalletMovement>,
    cursor?: string | null,
  ): Promise<'ingested' | 'stale'>
  getHoldCounts(): Promise<{ uncertain: number; dispatching: number }>
}

export interface NewMovementsResult {
  movements: WalletMovement[]
  cursor: string | null
}

export type WalletHistoryFailure =
  | 'invalid-cursor'
  | 'invalid-page-size'
  | 'invalid-signature-page'
  | 'repeated-signature'
  | 'cursor-not-found'
  | 'pagination-budget'
  | 'rpc-failure'
  | 'rpc-timeout'
  | 'transaction-unavailable'

export class WalletHistoryReadError extends Error {
  constructor(
    public readonly code: WalletHistoryFailure,
    message: string,
  ) {
    super(message)
    this.name = 'WalletHistoryReadError'
  }
}

export class SignatureContinuityError extends WalletHistoryReadError {
  constructor(message: string, code: WalletHistoryFailure = 'repeated-signature') {
    super(code, message)
    this.name = 'SignatureContinuityError'
  }
}

export const MAX_WATCH_PAGES_PER_POLL = 5

// Bound both RPC work and retained signatures independently of operator config.
const MAX_SIGNATURE_PAGES = 5
const MAX_SIGNATURE_PAGE_SIZE = 100
const RPC_SIGNATURE_PAGE_LIMIT = 1000
const DEFAULT_RPC_DEADLINE_MS = 15_000
const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const SIGNATURE_BYTE_LENGTH = 64
const MAX_SIGNATURE_TEXT_LENGTH = 88

// Validate canonical base58 shape only; authenticity remains the chain/provider's job.
const isTransactionSignature = (value: unknown): value is string => {
  if (
    typeof value !== 'string' ||
    value.length < SIGNATURE_BYTE_LENGTH ||
    value.length > MAX_SIGNATURE_TEXT_LENGTH
  ) {
    return false
  }
  let decoded = BigInt(0)
  for (const character of value) {
    const digit = BASE58_ALPHABET.indexOf(character)
    if (digit < 0) {
      return false
    }
    decoded = decoded * BigInt(58) + BigInt(digit)
  }
  let byteLength = 0
  while (decoded > BigInt(0)) {
    byteLength++
    decoded >>= BigInt(8)
  }
  for (const character of value) {
    if (character !== '1') {
      break
    }
    byteLength++
  }
  return byteLength === SIGNATURE_BYTE_LENGTH
}

function validateSignaturePage(
  page: unknown,
  limit: number,
): ConfirmedSignatureInfo[] {
  if (
    !Array.isArray(page) ||
    page.length > limit ||
    page.some(
      (item) =>
        typeof item !== 'object' ||
        item === null ||
        typeof item.signature !== 'string' ||
        !isTransactionSignature(item.signature),
    )
  ) {
    throw new SignatureContinuityError(
      'Wallet history returned a malformed signature page',
      'invalid-signature-page',
    )
  }
  return page as ConfirmedSignatureInfo[]
}

type WatcherConnection = Pick<
  Connection,
  'getSignaturesForAddress'
> &
  Partial<Pick<Connection, 'getParsedTransaction' | 'getParsedTransactions'>>

const TRANSACTION_BATCH_SIZE = 25

function formatBaseUnitAmount(
  value: bigint,
  decimals: number,
  fractionDigits = 4,
): string {
  const scale = BigInt(10) ** BigInt(decimals)
  const whole = value / scale
  const fraction = value % scale

  if (fractionDigits === 0) {
    return whole.toString()
  }

  const scaledFraction =
    decimals < fractionDigits
      ? fraction * BigInt(10) ** BigInt(fractionDigits - decimals)
      : fraction / BigInt(10) ** BigInt(decimals - fractionDigits)

  return `${whole.toString()}.${scaledFraction
    .toString()
    .padStart(fractionDigits, '0')}`
}

export class SolanaWatcherService {
  private readonly connection: WatcherConnection
  private readonly rpcDeadlineMs: number
  private pollInFlight: Promise<void> | null = null
  private nextWatchId = ''

  constructor(connection?: WatcherConnection, rpcDeadlineMs = DEFAULT_RPC_DEADLINE_MS) {
    if (!Number.isSafeInteger(rpcDeadlineMs) || rpcDeadlineMs < 1) {
      throw new Error('RPC deadline must be a positive integer')
    }
    this.connection =
      connection ??
      new Connection(config.solana.rpcUrl, {
        commitment: config.solana.commitment as 'confirmed',
      })
    this.rpcDeadlineMs = rpcDeadlineMs
  }

  public isValidAddress(address: string): boolean {
    try {
      new PublicKey(address)
      return true
    } catch {
      return false
    }
  }

  private async withRpcDeadline<T>(operation: Promise<T>): Promise<T> {
    const controller = new AbortController()
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(() => {
            controller.abort()
            reject(new WalletHistoryReadError(
              'rpc-timeout',
              'Wallet history unavailable: rpc-timeout',
            ))
          }, this.rpcDeadlineMs)
        }),
      ])
    } finally {
      clearTimeout(deadline)
    }
  }

  public pollWatchlist(
    ledger: WalletPollingStore,
    notify: (chatId: string, message: string) => Promise<DeliveryReceipt>,
  ): Promise<void> {
    if (this.pollInFlight) {
      return this.pollInFlight
    }

    const poll = this.runPoll(ledger, notify).finally(() => {
      if (this.pollInFlight === poll) {
        this.pollInFlight = null
      }
    })
    this.pollInFlight = poll
    return poll
  }

  private async runPoll(
    ledger: WalletPollingStore,
    notify: (chatId: string, message: string) => Promise<DeliveryReceipt>,
  ): Promise<void> {
    // Drain committed work even with no watches, no fresh activity, or held reads.
    // Each dispatch is one bounded batch. A claimed delivery is never retried.
    await dispatchPendingDeliveries(ledger, notify)
    for (let page = 0; page < MAX_WATCH_PAGES_PER_POLL; page++) {
      const watches = await ledger.listWatches(this.nextWatchId, DELIVERY_BATCH_SIZE)
      for (const watch of watches) {
        try {
          const result = await this.fetchNewMovementsWithCursor(
            watch.walletAddress,
            watch.lastSignature,
          )
          await this.ingestResult(ledger, watch, result)
        } catch (error) {
          const code = error instanceof WalletIngestionError
            ? error.code
            : error instanceof WalletHistoryReadError
              ? error.code
              : 'read-or-ingestion-failed'
          logger.error('Wallet watch held without ingestion', {
            watchId: watch.id,
            code,
          })
        }
        this.nextWatchId = watch.id
      }
      if (watches.length < DELIVERY_BATCH_SIZE) {
        this.nextWatchId = ''
        break
      }
    }
    await dispatchPendingDeliveries(ledger, notify)
    const holds = await ledger.getHoldCounts()
    if (holds.uncertain || holds.dispatching) {
      logger.info('Wallet deliveries held for operator reconciliation', holds)
    }
  }

  private async ingestResult(
    ledger: WalletPollingStore,
    watch: DeliveryWatch,
    result: NewMovementsResult,
  ): Promise<void> {
    if (!result.cursor) {
      return
    }
    if (result.movements.length === 0) {
      await ledger.ingest(watch, [], result.cursor)
      return
    }

    const movementGroups: WalletMovement[][] = []
    for (const movement of result.movements) {
      const group = movementGroups[movementGroups.length - 1]
      if (group && group[0]!.signature === movement.signature) {
        group.push(movement)
      } else {
        movementGroups.push([movement])
      }
    }

    let currentWatch = watch
    let batch: WalletMovement[] = []
    for (const group of movementGroups) {
      if (group.length > MAX_INGESTION_MOVEMENTS) {
        throw new WalletIngestionError('invalid-batch')
      }
      if (
        batch.length > 0 &&
        batch.length + group.length > MAX_INGESTION_MOVEMENTS
      ) {
        const cursor = batch[batch.length - 1]!.signature
        const outcome = await ledger.ingest(currentWatch, batch, cursor)
        if (outcome === 'stale') {
          return
        }
        currentWatch = { ...currentWatch, lastSignature: cursor }
        batch = []
      }
      batch.push(...group)
    }

    if (batch.length > 0) {
      await ledger.ingest(currentWatch, batch, result.cursor)
    }
  }

  public async fetchNewMovements(
    walletAddress: string,
    lastSignature: string | null | undefined,
  ): Promise<WalletMovement[]> {
    return (await this.fetchNewMovementsWithCursor(walletAddress, lastSignature))
      .movements
  }

  public async fetchNewMovementsWithCursor(
    walletAddress: string,
    lastSignature: string | null | undefined,
  ): Promise<NewMovementsResult> {
    const pubkey = new PublicKey(walletAddress)
    if (lastSignature != null && !isTransactionSignature(lastSignature)) {
      throw new SignatureContinuityError(
        'Saved signature cursor is invalid',
        'invalid-cursor',
      )
    }
    const configuredLimit = config.watcher.signatureBatchSize
    if (
      !Number.isInteger(configuredLimit) ||
      configuredLimit < 1 ||
      configuredLimit > RPC_SIGNATURE_PAGE_LIMIT
    ) {
      throw new SignatureContinuityError(
        'Configured signature page size is invalid',
        'invalid-page-size',
      )
    }
    const limit = Math.min(configuredLimit, MAX_SIGNATURE_PAGE_SIZE)
    const maxPages = Math.min(
      MAX_SIGNATURE_PAGES,
      Math.max(1, Math.trunc(config.watcher.signatureMaxPages)),
    )

    const fresh: ConfirmedSignatureInfo[] = []
    const seen = new Set<string>()
    let before: string | undefined
    let anchored = !lastSignature
    let reachedHistoryEnd = false

    for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
      let signatures: ConfirmedSignatureInfo[]
      try {
        signatures = validateSignaturePage(
          await this.withRpcDeadline(
            this.connection.getSignaturesForAddress(pubkey, {
              limit,
              ...(before ? { before } : {}),
            }),
          ),
          limit,
        )
      } catch (error) {
        if (error instanceof WalletHistoryReadError) {
          throw error
        }
        throw new SignatureContinuityError(
          'Wallet history unavailable: rpc-failure',
          'rpc-failure',
        )
      }
      if (signatures.length === 0) {
        reachedHistoryEnd = true
        break
      }

      for (const item of signatures) {
        if (seen.has(item.signature)) {
          throw new SignatureContinuityError(
            'Wallet history returned a repeated signature',
            'repeated-signature',
          )
        }
        seen.add(item.signature)
      }
      for (const item of signatures) {
        if (item.signature === lastSignature) {
          anchored = true
          break
        }
        fresh.push(item)
      }
      if (anchored) {
        break
      }

      if (signatures.length < limit) {
        reachedHistoryEnd = true
        break
      }
      before = signatures[signatures.length - 1]!.signature
    }

    if (!anchored) {
      throw new SignatureContinuityError(
        'Saved signature cursor was not found within the configured RPC history window',
        reachedHistoryEnd ? 'cursor-not-found' : 'pagination-budget',
      )
    }

    const movements: WalletMovement[] = []
    const cursor = fresh[0]?.signature ?? null
    const items = [...fresh].reverse()
    const parsed = await this.fetchParsedTransactions(items)

    for (const [index, item] of items.entries()) {
      movements.push(
        ...this.parseMovements(walletAddress, item.signature, parsed[index]!),
      )
    }

    return { movements, cursor }
  }

  private async fetchParsedTransactions(
    items: ConfirmedSignatureInfo[],
  ): Promise<ParsedTransactionWithMeta[]> {
    const config = {
      commitment: 'confirmed' as const,
      maxSupportedTransactionVersion: 1 as const,
    }

    if (this.connection.getParsedTransactions) {
      const transactions: ParsedTransactionWithMeta[] = []
      for (let start = 0; start < items.length; start += TRANSACTION_BATCH_SIZE) {
        const batch = items.slice(start, start + TRANSACTION_BATCH_SIZE)
        let parsed: Array<ParsedTransactionWithMeta | null>
        try {
          parsed = await this.withRpcDeadline(
            this.connection.getParsedTransactions(
              batch.map((item) => item.signature),
              config,
            ),
          )
        } catch (error) {
          if (error instanceof WalletHistoryReadError) {
            throw error
          }
          throw new SignatureContinuityError(
            'Wallet history unavailable: rpc-failure',
            'rpc-failure',
          )
        }
        if (!Array.isArray(parsed) || parsed.length !== batch.length) {
          throw new SignatureContinuityError(
            'Wallet transaction batch returned an unexpected shape',
          )
        }
        for (const transaction of parsed) {
          if (!transaction?.meta) {
            throw new WalletHistoryReadError(
              'transaction-unavailable',
              'Wallet history unavailable: transaction metadata missing',
            )
          }
          transactions.push(transaction)
        }
      }
      return transactions
    }

    if (!this.connection.getParsedTransaction) {
      throw new SignatureContinuityError(
        'Wallet connection does not support parsed transactions',
      )
    }
    const transactions: ParsedTransactionWithMeta[] = []
    for (const item of items) {
      let transaction: ParsedTransactionWithMeta | null
      try {
        transaction = await this.withRpcDeadline(
          this.connection.getParsedTransaction(
            item.signature,
            config,
          ),
        )
      } catch (error) {
        if (error instanceof WalletHistoryReadError) {
          throw error
        }
        throw new SignatureContinuityError(
          'Wallet history unavailable: rpc-failure',
          'rpc-failure',
        )
      }
      if (!transaction?.meta) {
        throw new WalletHistoryReadError(
          'transaction-unavailable',
          'Wallet history unavailable: transaction metadata missing',
        )
      }
      transactions.push(transaction)
    }
    return transactions
  }

  public parseMovements(
    walletAddress: string,
    signature: string,
    transaction: ParsedTransactionWithMeta,
  ): WalletMovement[] {
    const movements: WalletMovement[] = []
    const meta = transaction.meta
    if (!meta) {
      return movements
    }

    const accountIndex = transaction.transaction.message.accountKeys.findIndex(
      (key) => key.pubkey.toBase58() === walletAddress,
    )

    if (accountIndex >= 0) {
      const pre = meta.preBalances[accountIndex] ?? BigInt(0)
      const post = meta.postBalances[accountIndex] ?? BigInt(0)
      const delta = post - pre

      if (delta !== BigInt(0)) {
        let direction: WalletMovement['direction'] = 'unknown'
        if (delta > BigInt(0)) {
          direction = 'in'
        } else if (delta < BigInt(0)) {
          direction = 'out'
        }

        const solDelta = formatBaseUnitAmount(
          delta < BigInt(0) ? -delta : delta,
          9,
        )
        movements.push({
          signature,
          direction,
          lamports: delta,
          summary: `SOL ${direction}: ${solDelta}`,
        })
      }
    }

    const tokenMovements = this.parseTokenBalanceChanges(
      walletAddress,
      signature,
      meta.preTokenBalances ?? [],
      meta.postTokenBalances ?? [],
    )
    movements.push(...tokenMovements)

    if (movements.length === 0) {
      movements.push({
        signature,
        direction: 'unknown',
        lamports: null,
        summary:
          accountIndex >= 0
            ? 'Transaction detected (no balance change)'
            : 'Transaction detected (role unknown)',
      })
    }

    return movements
  }

  private parseTokenBalanceChanges(
    walletAddress: string,
    signature: string,
    preBalances: TokenBalance[],
    postBalances: TokenBalance[],
  ): WalletMovement[] {
    const movements: WalletMovement[] = []
    const mints = new Set<string>()

    for (const balance of [...preBalances, ...postBalances]) {
      if (balance.owner === walletAddress) {
        mints.add(balance.mint)
      }
    }

    const ownedBalances = (
      entries: TokenBalance[],
      mint: string,
    ): TokenBalance[] =>
      entries.filter(
        (entry) => entry.mint === mint && entry.owner === walletAddress,
      )

    for (const mint of mints) {
      const preOwned = ownedBalances(preBalances, mint)
      const postOwned = ownedBalances(postBalances, mint)
      const preAmount = preOwned.reduce(
        (sum, entry) => sum + BigInt(entry.uiTokenAmount?.amount ?? '0'),
        BigInt(0),
      )
      const postAmount = postOwned.reduce(
        (sum, entry) => sum + BigInt(entry.uiTokenAmount?.amount ?? '0'),
        BigInt(0),
      )
      const delta = postAmount - preAmount

      if (delta === BigInt(0)) {
        continue
      }

      const decimals =
        postOwned[0]?.uiTokenAmount?.decimals ??
        preOwned[0]?.uiTokenAmount?.decimals ??
        0

      const uiDelta = formatBaseUnitAmount(
        delta < BigInt(0) ? -delta : delta,
        decimals,
      )
      const direction: WalletMovement['direction'] =
        delta > BigInt(0) ? 'in' : 'out'

      movements.push({
        signature,
        direction,
        lamports: null,
        tokenMint: mint,
        summary: `SPL ${direction}: ${uiDelta} (${mint.slice(0, 8)}…)`,
      })
    }

    return movements
  }
}
