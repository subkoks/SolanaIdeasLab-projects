import { config } from '../config/environment'
import { DatabaseService } from './database'
import { SolanaService } from './solana'
import type { TokenProgramType } from './solana'

export type AnalysisDepth = 'quick' | 'deep' | 'full'
export type SafetyLevel = 'safe' | 'watch' | 'risky' | 'dangerous'

const OWNERSHIP_RATIO_BPS_SCALE = 10_000n

export interface SafetyReportSummary {
  blacklisted: boolean
  contractAuthoritiesPresent: Array<string>
  holderCount: number
  recentActivityCount: number
  tokenProgram: TokenProgramType
  topHolderOwnershipRatio: number
}

export interface SafetyScanResult {
  analysisDepth: AnalysisDepth
  greenFlags: Array<string>
  overallScore: number
  recommendations: Array<string>
  redFlags: Array<string>
  safetyLevel: SafetyLevel
  scanTime: number
  summary: SafetyReportSummary
  scannedAt: string
  tokenAddress: string
}

const getSafetyLevel = (score: number): SafetyLevel => {
  if (score >= 80) {
    return 'safe'
  }

  if (score >= 60) {
    return 'watch'
  }

  if (score >= 40) {
    return 'risky'
  }

  return 'dangerous'
}

const clampScore = (score: number): number => Math.max(0, Math.min(100, Math.round(score)))

const calculateOwnershipRatio = (holderAmount: bigint, totalSupply: bigint): number => {
  if (holderAmount <= 0n || totalSupply <= 0n) {
    return 0
  }

  const ownershipInBps = (holderAmount * OWNERSHIP_RATIO_BPS_SCALE) / totalSupply
  return Number(ownershipInBps) / Number(OWNERSHIP_RATIO_BPS_SCALE)
}

export class SafetyScannerService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly solanaService: SolanaService,
  ) {}

  public async scanToken(tokenAddress: string, analysisDepth: AnalysisDepth = 'quick', userId?: string): Promise<SafetyScanResult> {
    const normalizedTokenAddress = tokenAddress.trim()

    if (!this.solanaService.isValidAddress(normalizedTokenAddress)) {
      throw new Error('Invalid token address')
    }

    const startedAt = Date.now()
    const blacklistRecord = await this.databaseService.getBlacklistedToken(normalizedTokenAddress)

    if (blacklistRecord) {
      const blacklistedResult: SafetyScanResult = {
        tokenAddress: normalizedTokenAddress,
        analysisDepth,
        scannedAt: new Date().toISOString(),
        scanTime: Date.now() - startedAt,
        overallScore: 0,
        safetyLevel: 'dangerous',
        redFlags: [
          `Token is blacklisted: ${blacklistRecord.reason}`,
        ],
        greenFlags: [],
        recommendations: [
          'Do not trade this token unless blacklist evidence is manually disproven',
        ],
        summary: {
          blacklisted: true,
          contractAuthoritiesPresent: [],
          holderCount: 0,
          recentActivityCount: 0,
          tokenProgram: 'unknown',
          topHolderOwnershipRatio: 0,
        },
      }

      await this.databaseService.saveScan(normalizedTokenAddress, blacklistedResult, userId)
      await this.databaseService.setCache(
        `scan:${normalizedTokenAddress}:${analysisDepth}`,
        blacklistedResult,
        config.monitoring.scanCacheTtlMs,
      )

      return blacklistedResult
    }

    const cacheKey = `scan:${normalizedTokenAddress}:${analysisDepth}`
    const cached = await this.databaseService.getCache<SafetyScanResult>(cacheKey)

    if (cached) {
      return cached
    }

    const [tokenInfo, topHolders, recentSignatures, holderCount] = await Promise.all([
      this.solanaService.getTokenInfo(normalizedTokenAddress),
      this.solanaService.getTokenLargestAccounts(normalizedTokenAddress),
      this.solanaService.getRecentSignatures(normalizedTokenAddress, analysisDepth === 'quick' ? 10 : 25),
      this.solanaService.getTokenHolderCount(normalizedTokenAddress),
    ])

    let score = 100
    const redFlags: Array<string> = []
    const greenFlags: Array<string> = []
    const recommendations: Array<string> = []
    const contractAuthoritiesPresent: Array<string> = []

    if (!tokenInfo) {
      score -= 35
      redFlags.push('Mint account could not be loaded from Solana RPC')
      recommendations.push('Verify the token mint exists and that RPC access is healthy')
    }

    if (tokenInfo?.tokenProgram === 'spl-token') {
      greenFlags.push('Token uses the standard SPL Token program')
    }

    if (tokenInfo?.tokenProgram === 'token-2022') {
      score -= 5
      redFlags.push('Token uses Token-2022 extensions that require manual review')
      recommendations.push('Inspect Token-2022 extensions (fees, transfer hooks, delegates) before entering')
    }

    if (tokenInfo?.tokenProgram === 'unknown') {
      score -= 25
      redFlags.push('Mint owner is not a recognized SPL token program')
      recommendations.push('Avoid trading tokens minted by unknown programs')
    }

    if (tokenInfo?.mintAuthority) {
      score -= 20
      contractAuthoritiesPresent.push('mintAuthority')
      redFlags.push('Mint authority is still active')
      recommendations.push('Treat supply as mutable until mint authority is revoked')
    } else {
      greenFlags.push('Mint authority appears revoked')
    }

    if (tokenInfo?.freezeAuthority) {
      score -= 15
      contractAuthoritiesPresent.push('freezeAuthority')
      redFlags.push('Freeze authority is still active')
      recommendations.push('Check whether the issuer can freeze user balances')
    } else {
      greenFlags.push('Freeze authority appears revoked')
    }

    if (holderCount < 5) {
      score -= 20
      redFlags.push('Very low visible holder count')
      recommendations.push('Avoid positions with highly concentrated holder bases')
    } else if (holderCount < 20) {
      score -= 10
      redFlags.push('Holder count is still thin')
    } else {
      greenFlags.push('Holder count is reasonably distributed for a new token')
    }

    const topHolderRawAmount = BigInt(topHolders[0]?.amount ?? '0')
    const supplyRawAmount = tokenInfo ? BigInt(tokenInfo.supply) : 0n
    const topHolderOwnershipRatio = calculateOwnershipRatio(topHolderRawAmount, supplyRawAmount)

    if (topHolderOwnershipRatio > 0.25) {
      score -= 20
      redFlags.push('Top holder controls more than 25% of visible supply')
      recommendations.push('Watch for insider exits or concentrated liquidity pulls')
    } else if (topHolderOwnershipRatio > 0.1) {
      score -= 10
      redFlags.push('Top holder concentration is elevated')
    } else if (topHolderOwnershipRatio > 0) {
      greenFlags.push('Top holder concentration is moderate')
    }

    if (recentSignatures.length === 0) {
      score -= 10
      redFlags.push('No recent transaction activity found')
    } else if (recentSignatures.length >= 10) {
      greenFlags.push('Recent on-chain activity is present')
    }

    if (recentSignatures.length >= 20 && holderCount < 10) {
      score -= 10
      redFlags.push('High transaction churn with low holder diversity')
      recommendations.push('Treat early activity as potentially bot-coordinated until holders diversify')
    }

    const bundleWindow = this.detectBundleActivity(recentSignatures)
    if (bundleWindow.detected) {
      score -= 15
      redFlags.push(
        `Possible coordinated buying detected (${bundleWindow.count} txs in ${bundleWindow.windowSeconds}s)`,
      )
      recommendations.push(
        'Wait for organic holder growth before sizing in — activity may be bundled',
      )
    }

    if (
      tokenInfo?.freezeAuthority &&
      topHolderOwnershipRatio > 0.15
    ) {
      score -= 12
      redFlags.push(
        'Active freeze authority with concentrated supply — liquidity can be frozen',
      )
      recommendations.push(
        'Confirm LP lock / renounced freeze authority before trading size',
      )
    } else if (!tokenInfo?.freezeAuthority && holderCount >= 10) {
      greenFlags.push('Freeze authority renounced with growing holder base')
    }

    if (analysisDepth !== 'quick' && recentSignatures.length < 3) {
      score -= 5
      recommendations.push('Wait for more trading history before increasing position size')
    }

    const finalScore = clampScore(score)
    const result: SafetyScanResult = {
      tokenAddress: normalizedTokenAddress,
      analysisDepth,
      scannedAt: new Date().toISOString(),
      scanTime: Date.now() - startedAt,
      overallScore: finalScore,
      safetyLevel: getSafetyLevel(finalScore),
      redFlags,
      greenFlags,
      recommendations,
      summary: {
        blacklisted: false,
        contractAuthoritiesPresent,
        holderCount,
        recentActivityCount: recentSignatures.length,
        tokenProgram: tokenInfo?.tokenProgram ?? 'unknown',
        topHolderOwnershipRatio: Number.isFinite(topHolderOwnershipRatio) ? topHolderOwnershipRatio : 0,
      },
    }

    await this.databaseService.saveScan(normalizedTokenAddress, result, userId)
    await this.databaseService.setCache(cacheKey, result, config.monitoring.scanCacheTtlMs)

    return result
  }

  public async getLatestScan(tokenAddress: string): Promise<SafetyScanResult | null> {
    return this.databaseService.getLatestScan(tokenAddress.trim())
  }

  public async getSafetyScore(tokenAddress: string): Promise<{ redFlags: Array<string>; safetyLevel: SafetyLevel; score: number; tokenAddress: string }> {
    const normalizedTokenAddress = tokenAddress.trim()
    const latestScan = (await this.getLatestScan(normalizedTokenAddress)) ?? (await this.scanToken(normalizedTokenAddress, 'quick'))

    return {
      tokenAddress: normalizedTokenAddress,
      score: latestScan.overallScore,
      safetyLevel: latestScan.safetyLevel,
      redFlags: latestScan.redFlags,
    }
  }

  public async generateReport(tokenAddress: string): Promise<{ recommendations: Array<string>; reportGeneratedAt: string; result: SafetyScanResult; tokenAddress: string }> {
    const normalizedTokenAddress = tokenAddress.trim()
    const result = (await this.getLatestScan(normalizedTokenAddress)) ?? (await this.scanToken(normalizedTokenAddress, 'deep'))

    return {
      tokenAddress: normalizedTokenAddress,
      reportGeneratedAt: new Date().toISOString(),
      result,
      recommendations: result.recommendations,
    }
  }

  public async analyzeContract(programId: string, analysisType: string): Promise<{ analysisType: string; flags: Array<string>; programId: string; recentActivityCount: number; validAddress: boolean; verdict: string }> {
    const validAddress = this.solanaService.isValidAddress(programId)
    const recentActivity = validAddress ? await this.solanaService.getRecentSignatures(programId, 10) : []
    const flags = validAddress ? [] : ['Program address is invalid']

    if (validAddress && recentActivity.length === 0) {
      flags.push('No recent program activity found')
    }

    return {
      programId,
      analysisType,
      validAddress,
      recentActivityCount: recentActivity.length,
      flags,
      verdict: flags.length === 0 ? 'No immediate contract-level warning signs detected' : 'Manual review recommended before interacting',
    }
  }

  public async detectRugPullRisk(tokenAddress: string, timeWindow: number): Promise<{ riskSignals: Array<string>; score: number; safetyLevel: SafetyLevel; timeWindow: number; tokenAddress: string }> {
    const normalizedTokenAddress = tokenAddress.trim()
    const latestScan = (await this.getLatestScan(normalizedTokenAddress)) ?? (await this.scanToken(normalizedTokenAddress, 'deep'))
    const riskSignals = [...latestScan.redFlags]

    if (latestScan.summary.recentActivityCount < 3) {
      riskSignals.push('Thin recent trading activity')
    }

    if (latestScan.summary.contractAuthoritiesPresent.length > 0) {
      riskSignals.push('Issuer still controls token authorities')
    }

    if (latestScan.summary.blacklisted) {
      riskSignals.push('Token appears in blacklist records')
    }

    return {
      tokenAddress: normalizedTokenAddress,
      timeWindow,
      score: latestScan.overallScore,
      safetyLevel: latestScan.safetyLevel,
      riskSignals,
    }
  }

  private detectBundleActivity(
    signatures: Array<{ blockTime: number | null; signature: string }>,
  ): { count: number; detected: boolean; windowSeconds: number } {
    const windowSeconds = 120
    const blockTimes = signatures
      .map((entry) => entry.blockTime)
      .filter((value): value is number => value !== null)
      .sort((left, right) => right - left)

    if (blockTimes.length < 8) {
      return { detected: false, count: blockTimes.length, windowSeconds }
    }

    const newest = blockTimes[0]!
    const burstCount = blockTimes.filter(
      (blockTime) => newest - blockTime <= windowSeconds,
    ).length

    return {
      detected: burstCount >= 8,
      count: burstCount,
      windowSeconds,
    }
  }
}
