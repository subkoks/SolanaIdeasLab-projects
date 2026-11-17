import {
  Connection,
  PublicKey,
  type ConfirmedSignatureInfo,
  type ParsedTransactionWithMeta,
  type TokenBalance,
} from '@solana/web3.js'
import { config } from '../lib/config'
import { logger } from '../lib/logger'
import type { DatabaseService } from './database'

export interface WalletMovement {
  direction: 'in' | 'out' | 'unknown'
  lamports: bigint | null
  signature: string
  summary: string
  tokenMint?: string
}

export interface NewMovementsResult {
  movements: WalletMovement[]
  cursor: string | null
}

export class TransactionUnavailableError extends Error {
  constructor(signature: string) {
    super(`Confirmed transaction is not yet available: ${signature}`)
    this.name = 'TransactionUnavailableError'
  }
}

export class SignatureContinuityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SignatureContinuityError'
  }
}

export class CursorUnavailableError extends SignatureContinuityError {
  constructor(message: string) {
    super(message)
    this.name = 'CursorUnavailableError'
  }
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
        item.signature.length === 0,
    )
  ) {
    throw new SignatureContinuityError(
      'Wallet history returned a malformed signature page',
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
  private pollInFlight: Promise<void> | null = null

  constructor(connection?: WatcherConnection) {
    this.connection =
      connection ??
      new Connection(config.solana.rpcUrl, {
        commitment: config.solana.commitment as 'confirmed',
      })
  }

  public isValidAddress(address: string): boolean {
    try {
      new PublicKey(address)
      return true
    } catch {
      return false
    }
  }

  public pollWatchlist(
    database: DatabaseService,
    notify: (chatId: string, message: string) => Promise<void>,
  ): Promise<void> {
    if (this.pollInFlight) {
      return this.pollInFlight
    }

    const poll = this.pollWatchlistOnce(database, notify).finally(() => {
      if (this.pollInFlight === poll) {
        this.pollInFlight = null
      }
    })
    this.pollInFlight = poll
    return poll
  }

  private async pollWatchlistOnce(
    database: DatabaseService,
    notify: (chatId: string, message: string) => Promise<void>,
  ): Promise<void> {
    const watches = await database.listActiveWatches()

    for (const watch of watches) {
      try {
        let result
        try {
          result = await this.fetchNewMovementsWithCursor(
            watch.walletAddress,
            watch.lastSignature,
          )
        } catch (error) {
          if (!(error instanceof CursorUnavailableError)) {
            throw error
          }

          await database.resetWatchCursor(watch.id)
          logger.warn('Saved wallet cursor exceeded the RPC history window', {
            walletAddress: watch.walletAddress,
          })
          result = await this.fetchNewMovementsWithCursor(
            watch.walletAddress,
            null,
          )
        }
        const { movements, cursor } = result

        if (cursor) {
          const label = watch.label ? `[${watch.label}] ` : ''
          await database.commitWatchProgress({
            watchId: watch.id,
            cursor,
            movements: movements.map((movement) => ({
              walletAddress: watch.walletAddress,
              signature: movement.signature,
              direction: movement.direction,
              lamports: movement.lamports ?? undefined,
              tokenMint: movement.tokenMint,
              summary: movement.summary,
            })),
            notifications: movements.map((movement) => ({
              signature: movement.signature,
              message: [
                `${label}Wallet activity`,
                `Wallet: ${watch.walletAddress}`,
                movement.summary,
                `Signature: ${movement.signature}`,
              ].join('\n'),
            })),
          })
        }
      } catch (error) {
        logger.error('Failed to poll wallet watch', {
          walletAddress: watch.walletAddress,
          error,
        })
      }

      try {
        await this.dispatchPendingNotifications(database, notify, watch.id, watch.subscriber.chatId)
      } catch (error) {
        logger.error('Failed to deliver wallet notifications', {
          walletAddress: watch.walletAddress,
          error,
        })
      }
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
    const limit = Math.max(1, Math.trunc(config.watcher.signatureBatchSize))
    const maxPages = Math.max(1, Math.trunc(config.watcher.signatureMaxPages))

    const fresh: ConfirmedSignatureInfo[] = []
    const seen = new Set<string>()
    let before: string | undefined
    let anchored = !lastSignature

    for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
      const signatures = validateSignaturePage(
        await this.connection.getSignaturesForAddress(pubkey, {
          limit,
          ...(before ? { before } : {}),
        }),
        limit,
      )
      if (signatures.length === 0) {
        break
      }

      for (const item of signatures) {
        if (seen.has(item.signature)) {
          throw new SignatureContinuityError(
            'Wallet history returned a repeated signature',
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

      const nextBefore = signatures.at(-1)?.signature
      if (
        !nextBefore ||
        nextBefore === before ||
        signatures.length < limit
      ) {
        break
      }
      before = nextBefore
      if (pageNumber === maxPages - 1) {
        throw new SignatureContinuityError(
          'Signature history exceeded the configured page limit before reaching the saved cursor',
        )
      }
    }

    if (lastSignature && !anchored) {
      throw new CursorUnavailableError(
        'Saved signature cursor was not found within the configured RPC history window',
      )
    }

    const movements: WalletMovement[] = []
    const cursor = fresh[0]?.signature ?? null
    const items = [...fresh].reverse()
    const parsed = await this.fetchParsedTransactions(items)

    for (const [index, item] of items.entries()) {
      const transaction = parsed[index]!
      movements.push(
        ...this.parseMovements(walletAddress, item.signature, transaction),
      )
    }

    return { movements: this.collapseMovementsBySignature(movements), cursor }
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
        const parsed = await this.connection.getParsedTransactions(
          batch.map((item) => item.signature),
          config,
        )
        if (!Array.isArray(parsed) || parsed.length !== batch.length) {
          throw new SignatureContinuityError(
            'Wallet transaction batch returned an unexpected shape',
          )
        }
        for (const [index, transaction] of parsed.entries()) {
          if (!transaction?.meta) {
            throw new TransactionUnavailableError(batch[index]!.signature)
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
      const transaction = await this.connection.getParsedTransaction(
        item.signature,
        config,
      )
      if (!transaction?.meta) {
        throw new TransactionUnavailableError(item.signature)
      }
      transactions.push(transaction)
    }
    return transactions
  }

  private async dispatchPendingNotifications(
    database: Pick<
      DatabaseService,
      | 'claimPendingNotifications'
      | 'markNotificationDelivered'
      | 'releaseNotificationClaim'
    >,
    notify: (chatId: string, message: string) => Promise<void>,
    watchId: string,
    chatId: string,
  ): Promise<void> {
    const pending = await database.claimPendingNotifications(watchId)
    const failures: unknown[] = []
    for (const notification of pending) {
      try {
        await notify(chatId, notification.message)
        await database.markNotificationDelivered(
          notification.id,
          notification.claimToken,
        )
      } catch (error) {
        await database.releaseNotificationClaim(
          notification.id,
          notification.claimToken,
        )
        failures.push(error)
      }
    }
    if (failures.length > 0) {
      throw failures[0]
    }
  }

  private collapseMovementsBySignature(
    movements: WalletMovement[],
  ): WalletMovement[] {
    const bySignature = new Map<string, WalletMovement>()
    for (const movement of movements) {
      const existing = bySignature.get(movement.signature)
      if (!existing) {
        bySignature.set(movement.signature, movement)
        continue
      }

      const direction =
        existing.direction === movement.direction
          ? existing.direction
          : 'unknown'
      const lamports =
        existing.lamports !== null && movement.lamports !== null
          ? existing.lamports + movement.lamports
          : (existing.lamports ?? movement.lamports)
      const tokenMint =
        existing.tokenMint === movement.tokenMint
          ? existing.tokenMint
          : undefined
      const summary = existing.summary.includes(movement.summary)
        ? existing.summary
        : `${existing.summary}; ${movement.summary}`

      bySignature.set(movement.signature, {
        ...existing,
        direction,
        lamports,
        tokenMint,
        summary,
      })
    }
    return [...bySignature.values()]
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

    for (const mint of mints) {
      const preAmount = BigInt(
        preBalances.find(
          (entry) => entry.mint === mint && entry.owner === walletAddress,
        )?.uiTokenAmount?.amount ?? '0',
      )
      const postAmount = BigInt(
        postBalances.find(
          (entry) => entry.mint === mint && entry.owner === walletAddress,
        )?.uiTokenAmount?.amount ?? '0',
      )
      const delta = postAmount - preAmount

      if (delta === BigInt(0)) {
        continue
      }

      const decimals =
        postBalances.find(
          (entry) => entry.mint === mint && entry.owner === walletAddress,
        )?.uiTokenAmount?.decimals ??
        preBalances.find(
          (entry) => entry.mint === mint && entry.owner === walletAddress,
        )?.uiTokenAmount?.decimals ??
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
