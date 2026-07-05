import type { SafetyLevel, SafetyScanResult } from '../services/safety-scanner'

export interface MonitoringChangeEvent {
  nextLevel: SafetyLevel
  previousLevel: SafetyLevel
  scan: SafetyScanResult
  subscriberUserIds: ReadonlyArray<string>
  tokenAddress: string
}

export type MonitoringChangeHandler = (
  event: MonitoringChangeEvent,
) => void | Promise<void>
