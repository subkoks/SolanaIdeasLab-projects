import type { AnalysisDepth, SafetyScanResult } from './safety-scanner'
import { SafetyScannerService } from './safety-scanner'

interface MonitoringState {
  createdAt: string
  lastScanAt: string | null
  lastScanResult: SafetyScanResult | null
  tokenAddress: string
  userIds: Set<string>
}

export class MonitorService {
  private readonly activeMonitoring = new Map<string, MonitoringState>()
  private running = false

  constructor(private readonly safetyScannerService: SafetyScannerService) {}

  public async start(): Promise<void> {
    this.running = true
  }

  public async stop(): Promise<void> {
    this.running = false
    this.activeMonitoring.clear()
  }

  public async startMonitoring(tokenAddress: string, userId: string, analysisDepth: AnalysisDepth = 'quick'): Promise<MonitoringState> {
    const currentState = this.activeMonitoring.get(tokenAddress) ?? {
      tokenAddress,
      createdAt: new Date().toISOString(),
      lastScanAt: null,
      lastScanResult: null,
      userIds: new Set<string>(),
    }

    currentState.userIds.add(userId)
    currentState.lastScanResult = await this.safetyScannerService.scanToken(tokenAddress, analysisDepth, userId)
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

  public async getMonitoringStatus(tokenAddress: string): Promise<{ lastScanAt: string | null; running: boolean; safetyLevel: string | null; subscriberCount: number; tokenAddress: string }> {
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
}
