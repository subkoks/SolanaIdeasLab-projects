import WebSocket from "ws";
import { config } from "../config/environment";
import { getLaserStreamReconnectDelayMs } from "../utils/laserstream-reconnect";
import { SignatureDedupe } from "../utils/signature-dedupe";
import { logger } from "../utils/logger";
import { PUMP_FUN_PROGRAM_ID } from "./launch-detection";
import { parsePumpFunLaunchNotification } from "./helius-laserstream-parser";

export type LaunchTransactionHandler = (
  signature: string,
  blockTime: number | null,
) => void;

export interface LaserStreamStats {
  connected: boolean;
  enabled: boolean;
  messagesReceived: number;
  launchesDetected: number;
  launchesForwarded: number;
  duplicatesSkipped: number;
  reconnectAttempts: number;
  lastConnectedAt: string | null;
  lastMessageAt: string | null;
  dedupeCacheSize: number;
}

export { parsePumpFunLaunchNotification } from "./helius-laserstream-parser";

export class HeliusLaserStreamService {
  private ws: WebSocket | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private running = false;
  private reconnectAttempts = 0;
  private messagesReceived = 0;
  private launchesDetected = 0;
  private launchesForwarded = 0;
  private duplicatesSkipped = 0;
  private lastConnectedAt: Date | null = null;
  private lastMessageAt: Date | null = null;
  private readonly dedupe = new SignatureDedupe(300_000, 2_000);

  constructor(private readonly onLaunch: LaunchTransactionHandler) {}

  public start(): void {
    if (!config.externalApis.helius || !config.features.laserStream) {
      logger.info("Helius LaserStream disabled (missing API key or feature flag)");
      return;
    }

    this.running = true;
    this.connect();
  }

  public stop(): void {
    this.running = false;

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.ws?.close();
    this.ws = null;
  }

  public isActive(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  public getStats(): LaserStreamStats {
    return {
      connected: this.isActive(),
      enabled: Boolean(config.externalApis.helius && config.features.laserStream),
      messagesReceived: this.messagesReceived,
      launchesDetected: this.launchesDetected,
      launchesForwarded: this.launchesForwarded,
      duplicatesSkipped: this.duplicatesSkipped,
      reconnectAttempts: this.reconnectAttempts,
      lastConnectedAt: this.lastConnectedAt?.toISOString() ?? null,
      lastMessageAt: this.lastMessageAt?.toISOString() ?? null,
      dedupeCacheSize: this.dedupe.size(),
    };
  }

  private connect(): void {
    const url = `wss://mainnet.helius-rpc.com/?api-key=${config.externalApis.helius}`;
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      this.reconnectAttempts = 0;
      this.lastConnectedAt = new Date();
      logger.info("Helius LaserStream connected");

      this.ws?.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "transactionSubscribe",
          params: [
            {
              failed: false,
              accountInclude: [PUMP_FUN_PROGRAM_ID.toBase58()],
            },
            {
              commitment: "confirmed",
              encoding: "jsonParsed",
              transactionDetails: "full",
              maxSupportedTransactionVersion: 0,
            },
          ],
        }),
      );

      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.ping();
        }
      }, 30_000);
    });

    this.ws.on("message", (raw) => {
      this.messagesReceived += 1;
      this.lastMessageAt = new Date();

      try {
        const payload = JSON.parse(String(raw)) as unknown;
        const launch = parsePumpFunLaunchNotification(payload);

        if (!launch) {
          return;
        }

        this.launchesDetected += 1;

        if (!this.dedupe.shouldProcess(launch.signature)) {
          this.duplicatesSkipped += 1;
          return;
        }

        this.launchesForwarded += 1;
        this.onLaunch(launch.signature, launch.blockTime);
      } catch (error) {
        logger.debug("LaserStream message parse failed", { error });
      }
    });

    this.ws.on("close", () => {
      logger.warn("Helius LaserStream disconnected");
      this.scheduleReconnect();
    });

    this.ws.on("error", (error) => {
      logger.error("Helius LaserStream error", { error });
    });
  }

  private scheduleReconnect(): void {
    if (!this.running) {
      return;
    }

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.reconnectTimer) {
      return;
    }

    this.reconnectAttempts += 1;
    const delayMs = getLaserStreamReconnectDelayMs(this.reconnectAttempts);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.running) {
        logger.info("Reconnecting Helius LaserStream", {
          attempt: this.reconnectAttempts,
          delayMs,
        });
        this.connect();
      }
    }, delayMs);
  }
}
