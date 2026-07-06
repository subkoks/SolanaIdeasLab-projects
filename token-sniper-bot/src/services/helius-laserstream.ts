import WebSocket from "ws";
import { config } from "../config/environment";
import { logger } from "../utils/logger";
import { PUMP_FUN_PROGRAM_ID } from "./launch-detection";
import { parsePumpFunLaunchNotification } from "./helius-laserstream-parser";

export type LaunchTransactionHandler = (
  signature: string,
  blockTime: number | null,
) => void;

export { parsePumpFunLaunchNotification } from "./helius-laserstream-parser";

export class HeliusLaserStreamService {
  private ws: WebSocket | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private running = false;

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

  private connect(): void {
    const url = `wss://mainnet.helius-rpc.com/?api-key=${config.externalApis.helius}`;
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
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
      try {
        const payload = JSON.parse(String(raw)) as unknown;
        const launch = parsePumpFunLaunchNotification(payload);

        if (launch) {
          this.onLaunch(launch.signature, launch.blockTime);
        }
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

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.running) {
        logger.info("Reconnecting Helius LaserStream");
        this.connect();
      }
    }, 5_000);
  }
}
