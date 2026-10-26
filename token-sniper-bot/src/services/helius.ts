import type { AccountInfo, Commitment } from "@solana/web3.js";
import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "../config/environment";
import { logger } from "../utils/logger";
import { parseMintObservation } from "../utils/mint-observations";
import type { TokenProgramType } from "../utils/mint-observations";
import { TokenObservationUnavailableError } from "../utils/token-observation-error";
import { parseSupplyObservation, parseLargestObservations } from "../utils/balance-observations";

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
  mintAuthority: string | null;
  freezeAuthority: string | null;
  tokenProgram: TokenProgramType;
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

  async getAssetMetadata(
    mint: string,
  ): Promise<{ image?: string; name?: string; symbol?: string } | null> {
    if (!config.externalApis.helius) {
      return null;
    }

    try {
      const response = await fetch(
        `https://mainnet.helius-rpc.com/?api-key=${config.externalApis.helius}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "token-sniper-bot",
            method: "getAsset",
            params: { id: mint },
          }),
        },
      );

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as {
        result?: {
          content?: {
            metadata?: { name?: string; symbol?: string };
            links?: { image?: string };
          };
        };
      };

      const content = payload.result?.content;
      if (!content?.metadata) {
        return null;
      }

      return {
        name: content.metadata.name,
        symbol: content.metadata.symbol,
        image: content.links?.image,
      };
    } catch (error) {
      logger.debug("Helius getAsset metadata failed", { mint, error });
      return null;
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
      const accountInfo = await this.connection.getParsedAccountInfo(
        new PublicKey(tokenAddress),
      );

      if (accountInfo?.value === null) return null;
      const mint = parseMintObservation(accountInfo?.value, tokenAddress);
      if (!mint) return null;
      // Mint accounts do not establish names, creators, social links or liquidity locks.
      return { tokenAddress, ...mint, name: "Unknown Token", symbol: "UNKNOWN", creator: "", metadata: {} };
    } catch {
      throw new TokenObservationUnavailableError();
    }
  }

  async getTokenSupply(tokenAddress: string): Promise<string> {
    try {
      const supply = await this.connection.getTokenSupply(
        new PublicKey(tokenAddress),
      );
      return parseSupplyObservation(supply?.value).amount;
    } catch {
      throw new TokenObservationUnavailableError();
    }
  }

  async getTokenSupplyUi(tokenAddress: string): Promise<number> {
    try {
      const supply = await this.connection.getTokenSupply(
        new PublicKey(tokenAddress),
      );
      const observation = parseSupplyObservation(supply?.value);
      return Number(observation.amount) / 10 ** observation.decimals;
    } catch {
      throw new TokenObservationUnavailableError();
    }
  }

  async getTokenLargestAccounts(
    tokenAddress: string,
    limit: number = 10,
  ): Promise<Array<TokenLargestAccount>> {
    try {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TokenObservationUnavailableError();
      const largestAccounts = await this.connection.getTokenLargestAccounts(
        new PublicKey(tokenAddress),
      );

      return parseLargestObservations(largestAccounts?.value).slice(0, limit);
    } catch {
      throw new TokenObservationUnavailableError();
    }
  }

  async getTokenHolders(
    tokenAddress: string,
    limit: number = 100,
  ): Promise<string[]> {
    try {
      const accounts = await this.getTokenLargestAccounts(tokenAddress, limit);
      return accounts
        .filter((account) => BigInt(account.amount) > 0n)
        .map((account) => account.address);
    } catch {
      throw new TokenObservationUnavailableError();
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
        } catch {
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
