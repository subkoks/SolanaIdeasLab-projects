import { Connection, PublicKey, type ParsedTransactionWithMeta } from '@solana/web3.js'
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

type TokenBalanceEntry = {
  mint: string
  owner?: string
  uiTokenAmount?: { amount: string; decimals: number; uiAmount: number | null }
}

export class SolanaWatcherService {
  private readonly connection: Connection

  constructor(connection?: Connection) {
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

  public async pollWatchlist(
    database: DatabaseService,
    notify: (chatId: string, message: string) => Promise<void>,
  ): Promise<void> {
    const watches = await database.listActiveWatches()

    for (const watch of watches) {
      try {
        const movements = await this.fetchNewMovements(
          watch.walletAddress,
          watch.lastSignature,
        )

        if (movements.length === 0) {
          continue
        }

        await database.updateWatchCursor(
          watch.id,
          movements[movements.length - 1]!.signature,
        )

        for (const movement of movements) {
          await database.recordActivity({
            walletAddress: watch.walletAddress,
            signature: movement.signature,
            direction: movement.direction,
            lamports: movement.lamports ?? undefined,
            tokenMint: movement.tokenMint,
            summary: movement.summary,
          })

          const label = watch.label ? `[${watch.label}] ` : ''
          await notify(
            watch.subscriber.chatId,
            [
              `${label}Wallet activity`,
              `Wallet: ${watch.walletAddress}`,
              movement.summary,
              `Signature: ${movement.signature}`,
            ].join('\n'),
          )
        }
      } catch (error) {
        logger.error('Failed to poll wallet watch', {
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
    const pubkey = new PublicKey(walletAddress)
    const signatures = await this.connection.getSignaturesForAddress(pubkey, {
      limit: config.watcher.signatureBatchSize,
    })

    const fresh = []
    for (const item of signatures) {
      if (item.signature === lastSignature) {
        break
      }
      fresh.push(item)
    }

    const movements: WalletMovement[] = []

    for (const item of fresh.reverse()) {
      const parsed = await this.connection.getParsedTransaction(item.signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      })

      if (!parsed?.meta) {
        continue
      }

      movements.push(
        ...this.parseMovements(walletAddress, item.signature, parsed),
      )
    }

    return movements
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
      const pre = meta.preBalances[accountIndex] ?? 0
      const post = meta.postBalances[accountIndex] ?? 0
      const delta = BigInt(post - pre)

      if (delta !== BigInt(0)) {
        let direction: WalletMovement['direction'] = 'unknown'
        if (delta > BigInt(0)) {
          direction = 'in'
        } else if (delta < BigInt(0)) {
          direction = 'out'
        }

        const solDelta = Number(delta) / 1_000_000_000
        movements.push({
          signature,
          direction,
          lamports: delta,
          summary: `SOL ${direction}: ${Math.abs(solDelta).toFixed(4)}`,
        })
      }
    }

    const tokenMovements = this.parseTokenBalanceChanges(
      walletAddress,
      signature,
      (meta.preTokenBalances ?? []) as TokenBalanceEntry[],
      (meta.postTokenBalances ?? []) as TokenBalanceEntry[],
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
    preBalances: TokenBalanceEntry[],
    postBalances: TokenBalanceEntry[],
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

      const uiDelta = Number(delta) / 10 ** decimals
      const direction: WalletMovement['direction'] =
        delta > BigInt(0) ? 'in' : 'out'

      movements.push({
        signature,
        direction,
        lamports: null,
        tokenMint: mint,
        summary: `SPL ${direction}: ${Math.abs(uiDelta).toFixed(4)} (${mint.slice(0, 8)}…)`,
      })
    }

    return movements
  }
}
