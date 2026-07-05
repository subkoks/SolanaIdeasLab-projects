import { config } from '../config/environment'
import { logger } from '../utils/logger'
import type { MonitoringChangeHandler } from '../types/monitoring'
import type { AnalysisDepth, SafetyScanResult } from './safety-scanner'
import { SafetyScannerService } from './safety-scanner'

interface MonitoringState {
  analysisDepth: AnalysisDepth
  createdAt: string
  lastScanAt: string | null
  lastScanResult: SafetyScanResult | null
  tokenAddress: string
  userIds: Set<string>
}

export class MonitorService {
  private readonly activeMonitoring = new Map<string, MonitoringState>()
  private rescanTimer: NodeJS.Timeout | null = null
  private running = false
  private onChangeHandler: MonitoringChangeHandler | null = null

  constructor(private readonly safetyScannerService: SafetyScannerService) {}

  public setOnSafetyLevelChange(handler: MonitoringChangeHandler | null): void {
    this.onChangeHandler = handler
  }

  public async start(): Promise<void> {
    this.running = true

    if (this.rescanTimer) {
      return
    }

    this.rescanTimer = setInterval(() => {
      void this.rescanActiveTokens()
    }, config.monitoring.rescanIntervalMs)
  }

  public async stop(): Promise<void> {
    this.running = false

    if (this.rescanTimer) {
      clearInterval(this.rescanTimer)
      this.rescanTimer = null
    }

    this.activeMonitoring.clear()
  }

  public async startMonitoring(
    tokenAddress: string,
    userId: string,
    analysisDepth: AnalysisDepth = 'quick',
  ): Promise<MonitoringState> {
    const currentState = this.activeMonitoring.get(tokenAddress) ?? {
      tokenAddress,
      analysisDepth,
      createdAt: new Date().toISOString(),
      lastScanAt: null,
      lastScanResult: null,
      userIds: new Set<string>(),
    }

    currentState.analysisDepth = analysisDepth
    currentState.userIds.add(userId)
    currentState.lastScanResult = await this.safetyScannerService.scanToken(
      tokenAddress,
      analysisDepth,
      userId,
    )
    currentState.lastScanAt = new Date().toISOString()

    this.activeMonitoring.set(tokenAddress, currentState)
    return currentState
  }

  public async stopMonitoring(tokenAddress: string, userId: string): Promise<void> {
    const currentState = this.activeMonitoring.get(tokenAddress)

    if (!currentState) {
      return
    }

    currentState.userIds.delete(userId)

    if (currentState.userIds.size === 0) {
      this.activeMonitoring.delete(tokenAddress)
      return
    }

    this.activeMonitoring.set(tokenAddress, currentState)
  }

  public async getMonitoringStatus(tokenAddress: string): Promise<{
    lastScanAt: string | null
    running: boolean
    safetyLevel: string | null
    subscriberCount: number
    tokenAddress: string
  }> {
    const currentState = this.activeMonitoring.get(tokenAddress)

    return {
      tokenAddress,
      running: this.running && Boolean(currentState),
      subscriberCount: currentState?.userIds.size ?? 0,
      lastScanAt: currentState?.lastScanAt ?? null,
      safetyLevel: currentState?.lastScanResult?.safetyLevel ?? null,
    }
  }

  public async getActiveMonitoringCount(): Promise<number> {
    return this.activeMonitoring.size
  }

  private async rescanActiveTokens(): Promise<void> {
    if (!this.running || this.activeMonitoring.size === 0) {
      return
    }

    for (const [tokenAddress, state] of this.activeMonitoring.entries()) {
      try {
        const previousLevel = state.lastScanResult?.safetyLevel
        state.lastScanResult = await this.safetyScannerService.scanToken(
          tokenAddress,
          state.analysisDepth,
        )
        state.lastScanAt = new Date().toISOString()

        if (
          previousLevel &&
          state.lastScanResult.safetyLevel !== previousLevel
        ) {
          logger.info('Monitoring safety level changed', {
            tokenAddress,
            previousLevel,
            nextLevel: state.lastScanResult.safetyLevel,
            subscribers: state.userIds.size,
          })

          if (this.onChangeHandler) {
            await this.onChangeHandler({
              tokenAddress,
              previousLevel,
              nextLevel: state.lastScanResult.safetyLevel,
              scan: state.lastScanResult,
              subscriberUserIds: Array.from(state.userIds),
            })
          }
        }
      } catch (error) {
        logger.error('Monitoring rescan failed', { tokenAddress, error })
      }
    }
  }
}
