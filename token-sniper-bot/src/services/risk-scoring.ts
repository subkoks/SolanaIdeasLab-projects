import { logger } from "../utils/logger";
import { DatabaseService } from "./database";
import { HeliusService } from "./helius";
import type { TokenLaunchData } from "./helius";
import { calculateDistribution } from "../utils/distribution-observations";
import type { DistributionEvidence } from "../utils/distribution-observations";

const riskCacheKey = (address: string, depth: string): string => `risk_score_v3_${address}_${depth}`;

export interface RiskScore {
  distributionEvidence?: DistributionEvidence;
  total: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  categories: {
    contract: number;
    liquidity: number;
    distribution: number;
    social: number;
    developer: number;
  };
  factors: {
    renouncedMint: boolean;
    liquidityLocked: boolean | null;
    freezeAuthorityRevoked: boolean;
    top10Holding: number;
    socialSentiment: number;
    developerReputation: number;
    suspiciousFunctions: boolean;
  };
  recommendations: string[];
}

export interface BundleActivity {
  detected: boolean;
  wallets: string[];
  buyPattern: {
    timing: number;
    amounts: number[];
    addresses: string[];
  };
  riskLevel: "low" | "medium" | "high";
  confidence: number;
}

export interface WhaleAlert {
  whaleAddress: string;
  action: "buy" | "sell" | "transfer";
  tokenAddress: string;
  amount: number;
  usdValue: number;
  impact: "low" | "medium" | "high";
  historicalData: {
    winRate: number;
    avgHoldTime: number;
    totalPnL: number;
  };
}

export class RiskScoringService {
  private helius: HeliusService;
  private db: DatabaseService;

  constructor(helius: HeliusService, db: DatabaseService) {
    this.helius = helius;
    this.db = db;
  }

  async analyzeToken(
    tokenAddress: string,
    analysisDepth: "quick" | "detailed" | "comprehensive" = "quick",
  ): Promise<RiskScore> {
    try {
      logger.info(`Analyzing token: ${tokenAddress} (${analysisDepth})`);

      // Check cache first
      const cacheKey = riskCacheKey(tokenAddress, analysisDepth);
      const cached = await this.db.getCache(cacheKey);
      if (cached) {
        return cached;
      }

      const metadata = await this.helius.getTokenMetadata(tokenAddress);
      if (!metadata) {
        throw new Error("Token not found");
      }

      const largestAccounts = await this.helius.getTokenLargestAccounts(tokenAddress, 20);
      const distribution = calculateDistribution(metadata.supply, largestAccounts);

      const [
        contractScore,
        liquidityScore,
        distributionScore,
        socialScore,
        developerScore,
      ] = await Promise.all([
        this.analyzeContract(tokenAddress, metadata),
        this.analyzeLiquidity(distribution.evidence),
        this.analyzeDistribution(distribution.percentage),
        this.analyzeSocialSignals(tokenAddress, metadata),
        this.analyzeDeveloper(tokenAddress, metadata),
      ]);

      const totalScore = Math.round(
        (contractScore +
          liquidityScore +
          distributionScore +
          socialScore +
          developerScore) /
          5,
      );
      const riskLevel = this.determineRiskLevel(totalScore);
      const factors = {
        renouncedMint: metadata.mintAuthority === null,
        freezeAuthorityRevoked: metadata.freezeAuthority === null,
        // A mint account's freeze authority does not establish any LP lock.
        liquidityLocked: null,
        top10Holding: distribution.percentage,
        socialSentiment: await this.getSocialSentiment(tokenAddress),
        developerReputation: await this.getDeveloperReputation(tokenAddress),
        suspiciousFunctions: await this.hasSuspiciousFunctions(tokenAddress),
      };

      const riskScore: RiskScore = {
        distributionEvidence: distribution.evidence,
        total: totalScore,
        riskLevel,
        categories: {
          contract: contractScore,
          liquidity: liquidityScore,
          distribution: distributionScore,
          social: socialScore,
          developer: developerScore,
        },
        factors,
        recommendations: [],
      };

      riskScore.recommendations = this.generateRecommendations(
        riskScore,
        metadata,
      );

      // Cache the result
      await this.db.setCache(cacheKey, riskScore, 1800); // 30 minutes

      return riskScore;
    } catch (error) {
      logger.error(`Failed to analyze token ${tokenAddress}:`, error);
      throw error;
    }
  }

  async getRiskScore(tokenAddress: string): Promise<RiskScore> {
    try {
      const cacheKey = riskCacheKey(tokenAddress, "quick");
      let score = await this.db.getCache(cacheKey);

      if (!score) {
        score = await this.analyzeToken(tokenAddress, "quick");
      }

      return score;
    } catch (error) {
      logger.error(`Failed to get risk score for ${tokenAddress}:`, error);
      throw error;
    }
  }

  async detectBundles(
    tokenAddress: string,
    timeWindow: number = 3600,
  ): Promise<BundleActivity> {
    try {
      logger.info(`Detecting bundles for token: ${tokenAddress}`);

      const transactions = await this.getRecentTransactions(
        tokenAddress,
        timeWindow,
      );
      const bundles = this.identifyBundles(transactions);

      return bundles;
    } catch (error) {
      logger.error(`Failed to detect bundles for ${tokenAddress}:`, error);
      throw error;
    }
  }

  private async analyzeContract(
    tokenAddress: string,
    metadata: TokenLaunchData,
  ): Promise<number> {
    let score = 100;

    // Check for renounced authorities
    if (metadata.mintAuthority !== null) score -= 30;
    if (metadata.freezeAuthority !== null) score -= 20;

    // Check for suspicious functions
    if (await this.hasSuspiciousFunctions(tokenAddress)) {
      score -= 40;
    }

    // Check contract age
    const contractAge = await this.getContractAge(tokenAddress);
    if (contractAge < 86400000) {
      // Less than 1 day
      score -= 20;
    }

    return Math.max(0, score);
  }

  private analyzeLiquidity(evidence: DistributionEvidence): number {
    // Retained account-count heuristic; this does not establish a DEX pool.
    const count = evidence.positiveSampledAccountCount;
    return Math.max(0, 100 - (count < 10 ? 30 : 15) - (count < 3 ? 40 : 0));
  }

  private analyzeDistribution(top10Holding: number): number {
    if (top10Holding > 80) return 20;
    if (top10Holding > 60) return 40;
    if (top10Holding > 40) return 60;
    if (top10Holding > 20) return 80;
    return 90;
  }

  private async analyzeSocialSignals(
    tokenAddress: string,
    metadata: any,
  ): Promise<number> {
    let score = 50; // Default to neutral

    try {
      // Check external links
      const external = metadata.metadata?.external || {};

      if (external.website) score += 10;
      if (external.twitter) score += 10;
      if (external.telegram) score += 10;

      // Check social sentiment (would use social media APIs in production)
      const sentiment = await this.getSocialSentiment(tokenAddress);
      score += sentiment * 20; // Scale sentiment to 0-20
    } catch (error) {
      logger.error("Social signals analysis failed:", error);
    }

    return Math.min(100, Math.max(0, score));
  }

  private async analyzeDeveloper(
    tokenAddress: string,
    _metadata: any,
  ): Promise<number> {
    try {
      const reputation = await this.getDeveloperReputation(tokenAddress);

      // High reputation = safe
      if (reputation > 80) return 90;
      if (reputation > 60) return 75;
      if (reputation > 40) return 60;
      if (reputation > 20) return 40;

      return 20; // Low reputation
    } catch (error) {
      logger.error("Developer analysis failed:", error);
      return 50;
    }
  }

  private determineRiskLevel(
    score: number,
  ): "low" | "medium" | "high" | "critical" {
    if (score >= 80) return "low";
    if (score >= 60) return "medium";
    if (score >= 40) return "high";
    return "critical";
  }

  private generateRecommendations(
    riskScore: RiskScore,
    _metadata: any,
  ): string[] {
    const recommendations: string[] = [];

    if (riskScore.factors.suspiciousFunctions) {
      recommendations.push(
        "⚠️ Contract has suspicious functions - avoid this token",
      );
    }

    if (!riskScore.factors.freezeAuthorityRevoked) {
      recommendations.push(
        "🔒 Freeze authority is active - the issuer can freeze token accounts",
      );
    }
    if (riskScore.factors.liquidityLocked === null) {
      recommendations.push("Liquidity lock status has not been verified");
      recommendations.push("Liquidity category uses sampled token-account counts; DEX liquidity has not been verified");
    }

    if (riskScore.factors.top10Holding > 60) {
      recommendations.push(
        "📊 High concentration - largest visible token accounts hold most reported supply",
      );
    }

    if (riskScore.categories.liquidity < 50) {
      recommendations.push(
        "💧 Sparse visible token-account sample - verify DEX liquidity separately",
      );
    }

    if (riskScore.riskLevel === "critical") {
      recommendations.push(
        "🚨 EXTREMELY HIGH RISK - this appears to be a scam",
      );
    }

    if (riskScore.riskLevel === "high") {
      recommendations.push("⚠️ HIGH RISK - proceed with extreme caution");
    }

    if (recommendations.length === 0) {
      recommendations.push(
        "✅ Token appears relatively safe based on available data",
      );
    }

    return recommendations;
  }

  private async getSocialSentiment(_tokenAddress: string): Promise<number> {
    try {
      // This would use social media APIs to analyze sentiment
      // For now, return neutral sentiment
      return 0.5;
    } catch (error) {
      logger.error("Failed to get social sentiment:", error);
      return 0.5;
    }
  }

  private async getDeveloperReputation(_tokenAddress: string): Promise<number> {
    try {
      // This would check developer's history with other tokens
      // For now, return neutral reputation
      return 50;
    } catch (error) {
      logger.error("Failed to get developer reputation:", error);
      return 50;
    }
  }

  private async hasSuspiciousFunctions(
    _tokenAddress: string,
  ): Promise<boolean> {
    try {
      // This would analyze the contract for suspicious functions
      // For now, return false
      return false;
    } catch (error) {
      logger.error("Failed to check for suspicious functions:", error);
      return false;
    }
  }

  private async getContractAge(_tokenAddress: string): Promise<number> {
    try {
      // This would get the creation time of the contract
      // For now, return mock age
      return Date.now();
    } catch (error) {
      logger.error("Failed to get contract age:", error);
      return Date.now();
    }
  }

  private async getRecentTransactions(
    _tokenAddress: string,
    _timeWindow: number,
  ): Promise<any[]> {
    try {
      // Get recent transactions for bundle detection
      // This would use a time window to get transactions
      return [];
    } catch (error) {
      logger.error("Failed to get recent transactions:", error);
      return [];
    }
  }

  private identifyBundles(transactions: any[]): BundleActivity {
    // Simplified bundle detection - would use sophisticated analysis in production
    const detected = transactions.length > 5;
    const confidence = detected ? 0.7 : 0;

    return {
      detected,
      wallets: detected ? ["wallet1", "wallet2", "wallet3"] : [],
      buyPattern: {
        timing: detected ? 30 : 0,
        amounts: detected ? [100, 200, 150] : [],
        addresses: detected ? ["wallet1", "wallet2", "wallet3"] : [],
      },
      riskLevel: detected ? "high" : "low",
      confidence,
    };
  }
}
