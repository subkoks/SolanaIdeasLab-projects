import { Connection, PublicKey } from '@solana/web3.js'
import type { Commitment, ParsedAccountData, TokenAmount } from '@solana/web3.js'
import { config } from '../config/environment'

const LEGACY_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'

export type TokenProgramType = 'spl-token' | 'token-2022' | 'unknown'

export interface TokenLargestAccount {
  address: string
  amount: string
  uiAmount: number
}

export interface TokenInfo {
  address: string
  decimals: number
  freezeAuthority?: string
  mintAuthority?: string
  supply: string
  tokenProgram: TokenProgramType
}

const getTokenProgramType = (programAddress: string): TokenProgramType => {
  if (programAddress === LEGACY_TOKEN_PROGRAM) {
    return 'spl-token'
  }

  if (programAddress === TOKEN_2022_PROGRAM) {
    return 'token-2022'
  }

  return 'unknown'
}

export class SolanaService {
  private readonly connection: Connection

  constructor() {
    this.connection = new Connection(config.solana.rpcUrl, {
      commitment: config.solana.commitment as Commitment,
      confirmTransactionInitialTimeout: 60_000,
    })
  }

  public async connect(): Promise<void> {
    await this.connection.getSlot()
  }

  public async disconnect(): Promise<void> {
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.connection.getSlot()
      return true
    } catch {
      return false
    }
  }

  public isValidAddress(address: string): boolean {
    try {
      new PublicKey(address)
      return true
    } catch {
      return false
    }
  }

  public async getTokenInfo(tokenAddress: string): Promise<TokenInfo | null> {
    try {
      const parsedAccountInfo = await this.connection.getParsedAccountInfo(new PublicKey(tokenAddress))
      const parsedData = parsedAccountInfo.value?.data as ParsedAccountData | undefined
      const ownerProgramAddress = parsedAccountInfo.value?.owner?.toBase58() ?? ''
      const tokenProgram = getTokenProgramType(ownerProgramAddress)

      if (!parsedData || parsedData.parsed.type !== 'mint') {
        return null
      }

      const mintInfo = parsedData.parsed.info as {
        decimals: number
        freezeAuthority?: string
        mintAuthority?: string
        supply: string
      }

      return {
        address: tokenAddress,
        decimals: mintInfo.decimals,
        freezeAuthority: mintInfo.freezeAuthority,
        mintAuthority: mintInfo.mintAuthority,
        supply: mintInfo.supply,
        tokenProgram,
      }
    } catch {
      return null
    }
  }

  public async getTokenSupply(tokenAddress: string): Promise<string | null> {
    try {
      const supply = await this.connection.getTokenSupply(new PublicKey(tokenAddress))
      return supply.value.amount
    } catch {
      return null
    }
  }

  public async getTokenLargestAccounts(tokenAddress: string, limit: number = 10): Promise<Array<TokenLargestAccount>> {
    try {
      const largestAccounts = await this.connection.getTokenLargestAccounts(new PublicKey(tokenAddress))
      return largestAccounts.value.slice(0, limit).map((account) => ({
        address: account.address.toBase58(),
        amount: account.amount,
        uiAmount: account.uiAmount ?? 0,
      }))
    } catch {
      return []
    }
  }

  public async getRecentSignatures(address: string, limit: number = 20): Promise<Array<string>> {
    try {
      const signatures = await this.connection.getSignaturesForAddress(new PublicKey(address), { limit })
      return signatures.map((signature) => signature.signature)
    } catch {
      return []
    }
  }

  public async getTokenHolderCount(tokenAddress: string): Promise<number> {
    const largestAccounts = await this.getTokenLargestAccounts(tokenAddress, 20)
    return largestAccounts.filter((account) => account.uiAmount > 0).length
  }

  public normalizeTokenAmount(amount: TokenAmount | null | undefined): number {
    return amount?.uiAmount ?? 0
  }
}
