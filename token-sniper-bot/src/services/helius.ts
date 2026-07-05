import type { AccountInfo, Commitment } from "@solana/web3.js";
import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "../config/environment";
import { logger } from "../utils/logger";

export interface TokenLargestAccount {
  address: string;
  amount: string;
  uiAmount: number;
}

export interface HeliusWebhookEvent {
  signature: string;
  type: string;
  timestamp: number;
  account: string;
  slot: number;
  parsed: {
    info: unknown;
    type: string;
    data: unknown;
  };
}

export interface TokenLaunchData {
  tokenAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  supply: string;
  creator: string;
  mintAuthority: string;
  freezeAuthority: string;
  metadata: {
    description?: string;
    image?: string;
    external?: {
      website?: string;
      twitter?: string;
      telegram?: string;
    };
  };
}

export class HeliusService {
  private connection: Connection;
  private webhookUrl?: string;
  private isWebSocketConnected: boolean = false;

  constructor() {
    this.connection = new Connection(config.solana.rpcUrl, {
      commitment: config.solana.commitment as Commitment,
    });
  }

  getConnection(): Connection {
    return this.connection;
  }

  async connect(): Promise<void> {
    try {
      // Test connection
      const slot = await this.connection.getSlot();
      logger.info(`Connected to Solana RPC, current slot: ${slot}`);

      // Setup WebSocket if webhook URL is configured
      if (config.telegram.webhookUrl) {
        await this.setupWebSocket();
      }
    } catch (error) {
      logger.error("Failed to connect to Helius/Solana:", error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.isWebSocketConnected) {
        // Close WebSocket connections
        this.isWebSocketConnected = false;
        logger.info("WebSocket connections closed");
      }

      logger.info("RPC connection disconnected");
    } catch (error) {
      logger.error("Error during disconnection:", error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const slot = await this.connection.getSlot();
      return slot > 0;
    } catch (error) {
      logger.error("Helius health check failed:", error);
      return false;
    }
  }

  private async setupWebSocket(): Promise<void> {
    try {
      // This would be implemented with actual Helius WebSocket API
      // For now, we'll simulate with polling
      logger.info("WebSocket setup completed (simulated)");
      this.isWebSocketConnected = true;
    } catch (error) {
      logger.error("Failed to setup WebSocket:", error);
      throw error;
    }
  }

  async getTokenMetadata(
    tokenAddress: string,
  ): Promise<TokenLaunchData | null> {
    try {
      const accountInfo = await this.connection.getAccountInfo(
        new PublicKey(tokenAddress),
      );

      if (!accountInfo || !accountInfo.data) {
        return null;
      }

      // Parse token metadata (this would use actual Helius API in production)
      const metadata = this.parseTokenMetadata(accountInfo, tokenAddress);

      return metadata;
    } catch (error) {
      logger.error(`Failed to get token metadata for ${tokenAddress}:`, error);
      return null;
    }
  }

  async getTokenSupply(tokenAddress: string): Promise<string | null> {
    try {
      const supply = await this.connection.getTokenSupply(
        new PublicKey(tokenAddress),
      );
      return supply.value.amount;
    } catch (error) {
      logger.error(`Failed to get token supply for ${tokenAddress}:`, error);
      return null;
    }
  }

  async getTokenSupplyUi(tokenAddress: string): Promise<number> {
    try {
      const supply = await this.connection.getTokenSupply(
        new PublicKey(tokenAddress),
      );
      return supply.value.uiAmount ?? 0;
    } catch (error) {
      logger.error(`Failed to get token supply UI for ${tokenAddress}:`, error);
      return 0;
    }
  }

  async getTokenLargestAccounts(
    tokenAddress: string,
    limit: number = 10,
  ): Promise<TokenLargestAccount[]> {
    try {
      const largestAccounts = await this.connection.getTokenLargestAccounts(
        new PublicKey(tokenAddress),
      );

      return largestAccounts.value.slice(0, limit).map((account) => ({
        address: account.address.toBase58(),
        amount: account.amount,
        uiAmount: account.uiAmount ?? 0,
      }));
    } catch (error) {
      logger.error(
        `Failed to get largest accounts for ${tokenAddress}:`,
        error,
      );
      return [];
    }
  }

  async getTokenHolders(
    tokenAddress: string,
    limit: number = 100,
  ): Promise<string[]> {
    try {
      const accounts = await this.getTokenLargestAccounts(tokenAddress, limit);
      return accounts
        .filter((account) => account.uiAmount > 0)
        .map((account) => account.address);
    } catch (error) {
      logger.error(`Failed to get token holders for ${tokenAddress}:`, error);
      return [];
    }
  }

  async getRecentTransactions(
    walletAddress: string,
    limit: number = 10,
  ): Promise<any[]> {
    try {
      const signatures = await this.connection.getSignaturesForAddress(
        new PublicKey(walletAddress),
        { limit },
      );

      const transactions: Array<Record<string, unknown>> = [];
      for (const sig of signatures) {
        try {
          const tx = await this.connection.getParsedTransaction(sig.signature);
          if (tx) {
            transactions.push({
              signature: sig.signature,
              slot: tx.slot,
              blockTime: tx.blockTime,
              meta: tx.meta,
              transaction: tx.transaction,
            });
          }
        } catch (error) {
          // Skip failed transaction parsing
          continue;
        }
      }

      return transactions;
    } catch (error) {
      logger.error(
        `Failed to get recent transactions for ${walletAddress}:`,
        error,
      );
      return [];
    }
  }

  async subscribeToAccount(
    accountAddress: string,
    callback: (accountInfo: AccountInfo<Buffer>) => void,
  ): Promise<void> {
    try {
      const publicKey = new PublicKey(accountAddress);

      this.connection.onAccountChange(publicKey, (accountInfo) => {
        callback(accountInfo);
      });

      logger.info(`Subscribed to account changes: ${accountAddress}`);
    } catch (error) {
      logger.error(`Failed to subscribe to account ${accountAddress}:`, error);
      throw error;
    }
  }

  async subscribeToProgram(
    programId: string,
    callback: (accountInfo: AccountInfo<Buffer>, accountKey: string) => void,
  ): Promise<void> {
    try {
      const programPublicKey = new PublicKey(programId);

      this.connection.onProgramAccountChange(
        programPublicKey,
        (keyedAccountInfo) => {
          callback(
            keyedAccountInfo.accountInfo,
            keyedAccountInfo.accountId.toString(),
          );
        },
      );

      logger.info(`Subscribed to program changes: ${programId}`);
    } catch (error) {
      logger.error(`Failed to subscribe to program ${programId}:`, error);
      throw error;
    }
  }

  async subscribeToLogs(
    filters: Parameters<Connection["onLogs"]>[0],
    callback: (log: unknown) => void,
  ): Promise<void> {
    try {
      this.connection.onLogs(filters, (log) => {
        callback(log);
      });

      logger.info("Subscribed to logs");
    } catch (error) {
      logger.error("Failed to subscribe to logs:", error);
      throw error;
    }
  }

  async getAccountBalance(accountAddress: string): Promise<number> {
    try {
      const balance = await this.connection.getBalance(
        new PublicKey(accountAddress),
      );
      return balance;
    } catch (error) {
      logger.error(`Failed to get balance for ${accountAddress}:`, error);
      return 0;
    }
  }

  async getTokenBalance(
    walletAddress: string,
    tokenAddress: string,
  ): Promise<number> {
    try {
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        new PublicKey(walletAddress),
        { mint: new PublicKey(tokenAddress) },
      );

      const tokenAccount = tokenAccounts.value[0];

      if (tokenAccount) {
        const parsedData = tokenAccount.account.data as {
          parsed?: {
            info?: {
              tokenAmount?: {
                uiAmount?: number;
              };
            };
          };
        };

        return parsedData.parsed?.info?.tokenAmount?.uiAmount ?? 0;
      }

      return 0;
    } catch (error) {
      logger.error(
        `Failed to get token balance for ${walletAddress}/${tokenAddress}:`,
        error,
      );
      return 0;
    }
  }

  private parseTokenMetadata(
    accountInfo: AccountInfo<Buffer>,
    tokenAddress: string,
  ): TokenLaunchData {
    // This is a simplified parser - in production, use actual Helius API
    const data = accountInfo.data as any;

    return {
      tokenAddress,
      name: data.name || "Unknown Token",
      symbol: data.symbol || "UNKNOWN",
      decimals: data.decimals || 9,
      supply: data.supply || "0",
      creator: data.creator || "",
      mintAuthority: data.mintAuthority || "",
      freezeAuthority: data.freezeAuthority || "",
      metadata: {
        description: data.description,
        image: data.image,
        external: data.external || {},
      },
    };
  }

  async createWebhook(webhookConfig: any): Promise<string> {
    try {
      // This would use actual Helius webhook API
      logger.info("Creating webhook (simulated)");

      const webhookId = `webhook_${Date.now()}`;
      this.webhookUrl = webhookConfig.url;

      return webhookId;
    } catch (error) {
      logger.error("Failed to create webhook:", error);
      throw error;
    }
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    try {
      // This would use actual Helius webhook API
      logger.info(`Deleting webhook: ${webhookId}`);
      this.webhookUrl = undefined;
    } catch (error) {
      logger.error("Failed to delete webhook:", error);
      throw error;
    }
  }

  async getWebhooks(): Promise<any[]> {
    try {
      // This would use actual Helius webhook API
      logger.info("Getting webhooks (simulated)");
      return [];
    } catch (error) {
      logger.error("Failed to get webhooks:", error);
      return [];
    }
  }

  // Utility methods
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

  async simulateTransaction(transaction: any): Promise<any> {
    try {
      const simulation = await this.connection.simulateTransaction(transaction);
      return simulation;
    } catch (error) {
      logger.error("Transaction simulation failed:", error);
      throw error;
    }
  }
}
