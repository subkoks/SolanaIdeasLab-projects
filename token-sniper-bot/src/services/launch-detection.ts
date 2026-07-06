import { Connection, PublicKey, type ConfirmedSignatureInfo } from '@solana/web3.js'
import { config } from '../config/environment'
import { logger } from '../utils/logger'

export const PUMP_FUN_PROGRAM_ID = new PublicKey(
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
)

export interface DetectedLaunch {
  creator: string
  mint: string
  signature: string
  timestampMs: number
}

interface ParsedLaunchTx {
  creator: string
  mints: string[]
}

export class LaunchDetectionService {
  private readonly connection: Connection
  private readonly seenMints = new Set<string>()
  private bootstrapped = false
  private newestSignature: string | null = null

  constructor(connection?: Connection) {
    this.connection =
      connection ??
      new Connection(config.solana.rpcUrl, {
        commitment: config.solana.commitment as 'confirmed',
      })
  }

  public async pollPumpFunLaunches(): Promise<DetectedLaunch[]> {
    const signatures: ConfirmedSignatureInfo[] =
      await this.connection.getSignaturesForAddress(PUMP_FUN_PROGRAM_ID, {
        limit: 20,
      })

    if (signatures.length === 0) {
      return []
    }

    if (!this.bootstrapped) {
      this.bootstrapped = true
      this.newestSignature = signatures[0]?.signature ?? null

      for (const item of signatures) {
        const parsed = await this.parseLaunchTransaction(item.signature)
        for (const mint of parsed.mints) {
          this.seenMints.add(mint)
        }
      }

      return []
    }

    const freshSignatures: ConfirmedSignatureInfo[] = []
    for (const item of signatures) {
      if (item.signature === this.newestSignature) {
        break
      }
      freshSignatures.push(item)
    }

    if (signatures[0]?.signature) {
      this.newestSignature = signatures[0].signature
    }

    const launches: DetectedLaunch[] = []

    for (const item of freshSignatures.reverse()) {
      const parsed = await this.parseLaunchTransaction(item.signature)

      for (const mint of parsed.mints) {
        if (this.seenMints.has(mint)) {
          continue
        }

        this.seenMints.add(mint)
        launches.push({
          mint,
          signature: item.signature,
          creator: parsed.creator,
          timestampMs: (item.blockTime ?? Math.floor(Date.now() / 1000)) * 1000,
        })
      }
    }

    if (launches.length > 0) {
      logger.info('Detected pump.fun launches', { count: launches.length })
    }

    return launches
  }

  public async ingestSignature(
    signature: string,
    blockTime?: number | null,
  ): Promise<DetectedLaunch | null> {
    const parsed = await this.parseLaunchTransaction(signature)

    for (const mint of parsed.mints) {
      if (this.seenMints.has(mint)) {
        continue
      }

      this.seenMints.add(mint)
      this.bootstrapped = true

      return {
        mint,
        signature,
        creator: parsed.creator,
        timestampMs: (blockTime ?? Math.floor(Date.now() / 1000)) * 1000,
      }
    }

    return null
  }

  private async parseLaunchTransaction(
    signature: string,
  ): Promise<ParsedLaunchTx> {
    try {
      const transaction = await this.connection.getParsedTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      })

      if (!transaction?.meta) {
        return { creator: 'unknown', mints: [] }
      }

      const mints = new Set<string>()

      for (const balance of transaction.meta.postTokenBalances ?? []) {
        if (balance.mint) {
          mints.add(balance.mint)
        }
      }

      const creator =
        transaction.transaction.message.accountKeys[0]?.pubkey?.toBase58() ??
        'unknown'

      return {
        creator,
        mints: Array.from(mints),
      }
    } catch (error) {
      logger.debug('Failed to parse launch transaction', { signature, error })
      return { creator: 'unknown', mints: [] }
    }
  }
}
