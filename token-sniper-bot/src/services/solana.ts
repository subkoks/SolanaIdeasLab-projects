import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "../config/environment";
import { logger } from "../utils/logger";

export interface TokenInfo {
  address: string;
  name?: string;
  symbol?: string;
  decimals: number;
  supply: string;
  mintAuthority?: string;
  freezeAuthority?: string;
}

export interface TransactionInfo {
  signature: string;
  slot: number;
  blockTime?: number;
  fee: number;
  status: "success" | "failed";
  instructions: any[];
  accounts: string[];
}

export interface AccountBalance {
  address: string;
  balance: number;
  tokenAccounts: Array<{
    tokenAddress: string;
    balance: number;
    decimals: number;
  }>;
}

export class SolanaService {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(config.solana.rpcUrl, {
      commitment: config.solana.commitment as any,
      confirmTransactionInitialTimeout: 60000,
    });
  }

  async connect(): Promise<void> {
    try {
      const slot = await this.connection.getSlot();
      logger.info(`Connected to Solana RPC, current slot: ${slot}`);
    } catch (error) {
      logger.error("Failed to connect to Solana:", error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      // Connection doesn't have explicit close method in newer versions
      logger.info("Solana RPC connection closed");
    } catch (error) {
      logger.error("Error closing Solana connection:", error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const slot = await this.connection.getSlot();
      return slot > 0;
    } catch (error) {
      logger.error("Solana health check failed:", error);
      return false;
    }
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo | null> {
    try {
      const publicKey = new PublicKey(tokenAddress);
      const accountInfo = await this.connection.getParsedAccountInfo(publicKey);

      if (!accountInfo || !accountInfo.value) {
        return null;
      }

      const parsed = accountInfo.value.data as any;
      if (parsed.parsed?.type !== "mint") {
        return null;
      }

      const info = parsed.parsed?.info as any;
      return {
        address: tokenAddress,
        decimals: info.decimals,
        supply: info.supply,
        mintAuthority: info.mintAuthority,
        freezeAuthority: info.freezeAuthority,
      };
    } catch (error) {
      logger.error(`Failed to get token info for ${tokenAddress}:`, error);
      return null;
    }
  }

  async getAccountBalance(
    accountAddress: string,
  ): Promise<AccountBalance | null> {
    try {
      const publicKey = new PublicKey(accountAddress);
      const balance = await this.connection.getBalance(publicKey);

      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        publicKey,
        {
          programId: new PublicKey(
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          ),
        },
      );

      const tokenBalances = tokenAccounts.value.map((account) => {
        const parsed = account.account.data.parsed;
        return {
          tokenAddress: parsed.info.mint,
          balance: parsed.info.tokenAmount.uiAmount || 0,
          decimals: parsed.info.tokenAmount.decimals,
        };
      });

      return {
        address: accountAddress,
        balance: balance,
        tokenAccounts: tokenBalances,
      };
    } catch (error) {
      logger.error(
        `Failed to get account balance for ${accountAddress}:`,
        error,
      );
      return null;
    }
  }

  async getTransaction(signature: string): Promise<TransactionInfo | null> {
    try {
      const tx = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        return null;
      }

      return {
        signature,
        slot: tx.slot,
        blockTime: tx.blockTime || undefined,
        fee: tx.meta?.fee || 0,
        status: tx.meta?.err ? "failed" : "success",
        instructions: tx.transaction?.message?.instructions || [],
        accounts:
          tx.transaction?.message?.accountKeys?.map((key) => key.toString()) ||
          [],
      };
    } catch (error) {
      logger.error(`Failed to get transaction ${signature}:`, error);
      return null;
    }
  }

  async getSignaturesForAddress(
    address: string,
    limit: number = 10,
  ): Promise<string[]> {
    try {
      const publicKey = new PublicKey(address);
      const signatures = await this.connection.getSignaturesForAddress(
        publicKey,
        { limit },
      );

      return signatures.map((sig) => sig.signature);
    } catch (error) {
      logger.error(`Failed to get signatures for ${address}:`, error);
      return [];
    }
  }

  async getLatestBlockhash(): Promise<string> {
    try {
      const blockhash = await this.connection.getLatestBlockhash();
      return blockhash.blockhash;
    } catch (error) {
      logger.error("Failed to get latest blockhash:", error);
      throw error;
    }
  }

  async simulateTransaction(transaction: any): Promise<any> {
    try {
      const simulation = await this.connection.simulateTransaction(transaction);
      return simulation;
    } catch (error) {
      logger.error("Transaction simulation failed:", error);
      throw error;
    }
  }

  async subscribeToAccount(
    accountAddress: string,
    callback: (accountInfo: any) => void,
  ): Promise<number> {
    try {
      const publicKey = new PublicKey(accountAddress);
      const subscriptionId = this.connection.onAccountChange(
        publicKey,
        callback,
      );

      logger.info(`Subscribed to account changes: ${accountAddress}`);
      return subscriptionId;
    } catch (error) {
      logger.error(`Failed to subscribe to account ${accountAddress}:`, error);
      throw error;
    }
  }

  async subscribeToLogs(
    programId: string,
    callback: (logs: any) => void,
  ): Promise<number> {
    try {
      const programPublicKey = new PublicKey(programId);
      const subscriptionId = this.connection.onLogs(programPublicKey, callback);

      logger.info(`Subscribed to program logs: ${programId}`);
      return subscriptionId;
    } catch (error) {
      logger.error(`Failed to subscribe to program logs ${programId}:`, error);
      throw error;
    }
  }

  async unsubscribe(subscriptionId: number): Promise<void> {
    try {
      await this.connection.removeAccountChangeListener(subscriptionId);
      logger.info(`Unsubscribed from account changes: ${subscriptionId}`);
    } catch (error) {
      logger.error(`Failed to unsubscribe ${subscriptionId}:`, error);
    }
  }

  async getSlot(): Promise<number> {
    try {
      return await this.connection.getSlot();
    } catch (error) {
      logger.error("Failed to get slot:", error);
      throw error;
    }
  }

  async getBlockHeight(): Promise<number> {
    try {
      return await this.connection.getBlockHeight();
    } catch (error) {
      logger.error("Failed to get block height:", error);
      throw error;
    }
  }

  async getClusterNodes(): Promise<any[]> {
    try {
      return await this.connection.getClusterNodes();
    } catch (error) {
      logger.error("Failed to get cluster nodes:", error);
      throw error;
    }
  }

  async getVoteAccounts(): Promise<any> {
    try {
      return await this.connection.getVoteAccounts();
    } catch (error) {
      logger.error("Failed to get vote accounts:", error);
      throw error;
    }
  }

  async getTokenSupply(tokenAddress: string): Promise<string | null> {
    try {
      const publicKey = new PublicKey(tokenAddress);
      const supply = await this.connection.getTokenSupply(publicKey);
      return supply.value.toString();
    } catch (error) {
      logger.error(`Failed to get token supply for ${tokenAddress}:`, error);
      return null;
    }
  }

  async getTokenLargestAccounts(
    tokenAddress: string,
    limit: number = 10,
  ): Promise<any[]> {
    try {
      const publicKey = new PublicKey(tokenAddress);
      const accounts = await this.connection.getTokenLargestAccounts(publicKey);
      return accounts.value.slice(0, limit);
    } catch (error) {
      logger.error(
        `Failed to get token largest accounts for ${tokenAddress}:`,
        error,
      );
      return [];
    }
  }

  async getTokenAccountBalance(
    tokenAccountAddress: string,
  ): Promise<number | null> {
    try {
      const publicKey = new PublicKey(tokenAccountAddress);
      const balance = await this.connection.getTokenAccountBalance(publicKey);
      return balance.value.uiAmount || null;
    } catch (error) {
      logger.error(
        `Failed to get token account balance for ${tokenAccountAddress}:`,
        error,
      );
      return null;
    }
  }

  async getMultipleAccounts(accountAddresses: string[]): Promise<any[]> {
    try {
      const publicKeys = accountAddresses.map((addr) => new PublicKey(addr));
      const accounts =
        await this.connection.getMultipleAccountsInfo(publicKeys);
      return accounts.map((account) => account || null).filter(Boolean);
    } catch (error) {
      logger.error("Failed to get multiple accounts:", error);
      throw error;
    }
  }

  async getProgramAccounts(programId: string, filters?: any[]): Promise<any[]> {
    try {
      const programPublicKey = new PublicKey(programId);
      const accounts = await this.connection.getProgramAccounts(
        programPublicKey,
        {
          filters,
        },
      );
      return accounts as any[];
    } catch (error) {
      logger.error(`Failed to get program accounts for ${programId}:`, error);
      throw error;
    }
  }

  isValidAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  formatAmount(amount: number, decimals: number = 9): string {
    return (amount / Math.pow(10, decimals)).toLocaleString();
  }

  lamportsToSol(lamports: number): number {
    return lamports / 1_000_000_000;
  }

  solToLamports(sol: number): number {
    return Math.floor(sol * 1_000_000_000);
  }

  async getRecentPerformanceSamples(limit: number = 10): Promise<any[]> {
    try {
      const samples = await this.connection.getRecentPerformanceSamples(limit);
      return samples;
    } catch (error) {
      logger.error("Failed to get performance samples:", error);
      return [];
    }
  }

  async getFirstAvailableBlock(): Promise<number> {
    try {
      const block = await this.connection.getFirstAvailableBlock();
      return block;
    } catch (error) {
      logger.error("Failed to get first available block:", error);
      throw error;
    }
  }

  async getBlockTime(slot: number): Promise<number | null> {
    try {
      return await this.connection.getBlockTime(slot);
    } catch (error) {
      logger.error(`Failed to get block time for slot ${slot}:`, error);
      return null;
    }
  }

  async getBlock(slot: number, encoding: string = "json"): Promise<any> {
    try {
      return await this.connection.getBlock(slot, encoding as any);
    } catch (error) {
      logger.error(`Failed to get block ${slot}:`, error);
      throw error;
    }
  }

  async getConfirmedBlock(
    slot: number,
    encoding: string = "json",
  ): Promise<any> {
    try {
      return await this.connection.getConfirmedBlock(slot, encoding as any);
    } catch (error) {
      logger.error(`Failed to get confirmed block ${slot}:`, error);
      throw error;
    }
  }

  async getBlockProduction(): Promise<any> {
    try {
      return await this.connection.getBlockProduction();
    } catch (error) {
      logger.error("Failed to get block production:", error);
      throw error;
    }
  }

  async getEpochInfo(): Promise<any> {
    try {
      return await this.connection.getEpochInfo();
    } catch (error) {
      logger.error("Failed to get epoch info:", error);
      throw error;
    }
  }

  async getEpochSchedule(): Promise<any> {
    try {
      return await this.connection.getEpochSchedule();
    } catch (error) {
      logger.error("Failed to get epoch schedule:", error);
      throw error;
    }
  }

  async getLeaderSchedule(): Promise<any> {
    try {
      return await this.connection.getLeaderSchedule();
    } catch (error) {
      logger.error("Failed to get leader schedule:", error);
      throw error;
    }
  }

  async getMinimumBalanceForRentExempt(accountSize: number): Promise<number> {
    try {
      return await this.connection.getMinimumBalanceForRentExemption(
        accountSize,
      );
    } catch (error) {
      logger.error("Failed to get minimum balance for rent exempt:", error);
      throw error;
    }
  }

  async getRecentPrioritizationFees(): Promise<any[]> {
    try {
      return await this.connection.getRecentPrioritizationFees();
    } catch (error) {
      logger.error("Failed to get recent prioritization fees:", error);
      return [];
    }
  }

  async getFeeForMessage(message: any): Promise<number> {
    try {
      const fee = await this.connection.getFeeForMessage(message);
      return fee.value || 0;
    } catch (error) {
      logger.error("Failed to get fee for message:", error);
      return 0;
    }
  }

  async getStakeActivation(publicKey: string, epoch?: number): Promise<any> {
    try {
      const pubkey = new PublicKey(publicKey);
      const config = epoch !== undefined ? { epoch } : undefined;
      return await this.connection.getStakeActivation(pubkey, config);
    } catch (error) {
      logger.error(`Failed to get stake activation for ${publicKey}:`, error);
      throw error;
    }
  }

  async getAccountInfoWithConfig(
    publicKey: string,
    config: any,
  ): Promise<any | null> {
    try {
      const pubkey = new PublicKey(publicKey);
      return await this.connection.getAccountInfo(pubkey, config);
    } catch (error) {
      logger.error(
        `Failed to get account info with config for ${publicKey}:`,
        error,
      );
      return null;
    }
  }

  async getParsedAccountInfoWithConfig(
    publicKey: string,
    config: any,
  ): Promise<any> {
    try {
      const pubkey = new PublicKey(publicKey);
      return await this.connection.getParsedAccountInfo(pubkey, config);
    } catch (error) {
      logger.error(
        `Failed to get parsed account info with config for ${publicKey}:`,
        error,
      );
      return null;
    }
  }

  async getMultipleAccountsWithConfig(
    publicKeys: string[],
    config: any,
  ): Promise<(any | null)[]> {
    try {
      const pubkeys = publicKeys.map((key) => new PublicKey(key));
      return await this.connection.getMultipleAccountsInfo(pubkeys, config);
    } catch (error) {
      logger.error("Failed to get multiple accounts with config:", error);
      throw error;
    }
  }
}
