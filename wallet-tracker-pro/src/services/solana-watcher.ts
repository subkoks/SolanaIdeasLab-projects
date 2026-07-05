import { Connection, PublicKey } from '@solana/web3.js'
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
      const movement = await this.parseMovement(walletAddress, item.signature)
      if (movement) {
        movements.push(movement)
      }
    }

    return movements
  }

  private async parseMovement(
    walletAddress: string,
    signature: string,
  ): Promise<WalletMovement | null> {
    const transaction = await this.connection.getParsedTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })

    if (!transaction?.meta) {
      return null
    }

    const accountIndex = transaction.transaction.message.accountKeys.findIndex(
      (key) => key.pubkey.toBase58() === walletAddress,
    )

    if (accountIndex < 0) {
      return {
        signature,
        direction: 'unknown',
        lamports: null,
        summary: 'Transaction detected (role unknown)',
      }
    }

    const pre = transaction.meta.preBalances[accountIndex] ?? 0
    const post = transaction.meta.postBalances[accountIndex] ?? 0
    const delta = BigInt(post - pre)

    let direction: WalletMovement['direction'] = 'unknown'
    if (delta > BigInt(0)) {
      direction = 'in'
    } else if (delta < BigInt(0)) {
      direction = 'out'
    }

    const solDelta = Number(delta) / 1_000_000_000

    return {
      signature,
      direction,
      lamports: delta,
      summary: `SOL ${direction}: ${solDelta.toFixed(4)}`,
    }
  }
}
