import { logger } from "../utils/logger";
import { DatabaseService } from "./database";
import { HeliusService } from "./helius";
import { RiskScoringService } from "./risk-scoring";
import { SolanaService } from "./solana";

export interface SafetyScanResult {
  tokenAddress: string;
  overallScore: number;
  safetyLevel: "safe" | "caution" | "risky" | "dangerous";
  categories: {
    contract: SafetyCategory;
    liquidity: SafetyCategory;
    distribution: SafetyCategory;
    social: SafetyCategory;
    developer: SafetyCategory;
  };
  redFlags: RedFlag[];
  greenFlags: GreenFlag[];
  recommendations: string[];
  metadata: TokenMetadata;
  analysisDepth: "quick" | "detailed" | "comprehensive";
  scanTime: number;
  timestamp: number;
}

export interface SafetyCategory {
  score: number;
  weight: number;
  factors: {
    [key: string]: {
      value: boolean | number;
      impact: number;
      description: string;
    };
  };
}

export interface RedFlag {
  type: "security" | "liquidity" | "distribution" | "social" | "technical";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  evidence?: any;
}

export interface GreenFlag {
  type: "security" | "liquidity" | "distribution" | "social" | "technical";
  description: string;
  evidence?: any;
}

export interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
  supply: string;
  mintAuthority?: string;
  freezeAuthority?: string;
  creator?: string;
  description?: string;
  image?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}

export class SafetyScannerService {
  private helius: HeliusService;
  private solana: SolanaService;
  private riskScoring: RiskScoringService;
  private db: DatabaseService;

  constructor(
    helius: HeliusService,
    solana: SolanaService,
    riskScoring: RiskScoringService,
    db: DatabaseService,
  ) {
    this.helius = helius;
    this.solana = solana;
    this.riskScoring = riskScoring;
    this.db = db;
  }

  async scanToken(
    tokenAddress: string,
    analysisDepth: "quick" | "detailed" | "comprehensive" = "quick",
  ): Promise<SafetyScanResult> {
    const startTime = Date.now();

    try {
      logger.info(
        `Starting safety scan for token: ${tokenAddress} (${analysisDepth})`,
      );

      // Check cache first
      const cacheKey = `safety_scan_${tokenAddress}_${analysisDepth}`;
      const cached = await this.db.getCache(cacheKey);
      if (cached) {
        return cached;
      }

      // Get basic token info
      const tokenInfo = await this.helius.getTokenMetadata(tokenAddress);
      if (!tokenInfo) {
        throw new Error("Token not found");
      }

      // Perform safety analysis
      const [
        contractAnalysis,
        liquidityAnalysis,
        distributionAnalysis,
        socialAnalysis,
        developerAnalysis,
      ] = await Promise.all([
        this.analyzeContractSafety(tokenAddress, tokenInfo, analysisDepth),
        this.analyzeLiquiditySafety(tokenAddress, tokenInfo, analysisDepth),
        this.analyzeDistributionSafety(tokenAddress, tokenInfo, analysisDepth),
        this.analyzeSocialSignals(tokenAddress, tokenInfo, analysisDepth),
        this.analyzeDeveloperReputation(tokenAddress, tokenInfo, analysisDepth),
      ]);

      // Calculate overall score
      const overallScore = this.calculateOverallScore([
        contractAnalysis,
        liquidityAnalysis,
        distributionAnalysis,
        socialAnalysis,
        developerAnalysis,
      ]);

      // Determine safety level
      const safetyLevel = this.determineSafetyLevel(overallScore);

      // Generate flags and recommendations
      const redFlags = this.generateRedFlags(
        contractAnalysis,
        liquidityAnalysis,
        distributionAnalysis,
        socialAnalysis,
        developerAnalysis,
      );
      const greenFlags = this.generateGreenFlags(
        contractAnalysis,
        liquidityAnalysis,
        distributionAnalysis,
        socialAnalysis,
        developerAnalysis,
      );
      const recommendations = this.generateRecommendations(
        overallScore,
        redFlags,
        greenFlags,
      );

      const result: SafetyScanResult = {
        tokenAddress,
        overallScore,
        safetyLevel,
        categories: {
          contract: contractAnalysis,
          liquidity: liquidityAnalysis,
          distribution: distributionAnalysis,
          social: socialAnalysis,
          developer: developerAnalysis,
        },
        redFlags,
        greenFlags,
        recommendations,
        metadata: tokenInfo,
        analysisDepth,
        scanTime: Date.now() - startTime,
        timestamp: Date.now(),
      };

      // Cache the result
      await this.db.setCache(cacheKey, result, 1800); // 30 minutes

      logger.info(
        `Safety scan completed for ${tokenAddress}: ${overallScore}/100 (${safetyLevel})`,
      );
      return result;
    } catch (error) {
      logger.error(`Safety scan failed for ${tokenAddress}:`, error);
      throw error;
    }
  }

  async getLatestScan(tokenAddress: string): Promise<SafetyScanResult | null> {
    try {
      const cacheKey = `safety_scan_${tokenAddress}_quick`;
      const cached = await this.db.getCache(cacheKey);

      if (cached) {
        return cached;
      }

      // If not cached, perform quick scan
      return await this.scanToken(tokenAddress, "quick");
    } catch (error) {
      logger.error(`Failed to get latest scan for ${tokenAddress}:`, error);
      return null;
    }
  }

  private async analyzeContractSafety(
    tokenAddress: string,
    metadata: any,
    _depth: string,
  ): Promise<SafetyCategory> {
    const factors: any = {};
    let score = 100;

    // Check mint authority
    const hasMintAuthority = !!metadata.mintAuthority;
    factors["mint_authority"] = {
      value: hasMintAuthority,
      impact: hasMintAuthority ? -30 : 10,
      description: hasMintAuthority
        ? "Mint authority can create more tokens"
        : "Mint authority is renounced",
    };
    if (!hasMintAuthority) score += 10;
    else score -= 30;

    // Check freeze authority
    const hasFreezeAuthority = !!metadata.freezeAuthority;
    factors["freeze_authority"] = {
      value: hasFreezeAuthority,
      impact: hasFreezeAuthority ? -20 : 10,
      description: hasFreezeAuthority
        ? "Freeze authority can freeze transfers"
        : "Freeze authority is renounced",
    };
    if (!hasFreezeAuthority) score += 10;
    else score -= 20;

    // Check for suspicious contract patterns (would use actual analysis in production)
    const hasSuspiciousFunctions =
      await this.checkSuspiciousFunctions(tokenAddress);
    factors["suspicious_functions"] = {
      value: hasSuspiciousFunctions,
      impact: hasSuspiciousFunctions ? -40 : 5,
      description: hasSuspiciousFunctions
        ? "Contract contains suspicious functions"
        : "No suspicious functions detected",
    };
    if (hasSuspiciousFunctions) score -= 40;
    else score += 5;

    // Check contract age
    const contractAge = await this.getContractAge(tokenAddress);
    const isRecent = contractAge < 86400000; // Less than 1 day
    factors["contract_age"] = {
      value: contractAge,
      impact: isRecent ? -15 : 5,
      description: isRecent
        ? "Contract created recently"
        : "Contract has existed for some time",
    };
    if (!isRecent) score += 5;
    else score -= 15;

    // Check for verified source (would use actual verification)
    const isVerified = await this.isContractVerified(tokenAddress);
    factors["verified_source"] = {
      value: isVerified,
      impact: isVerified ? 15 : -5,
      description: isVerified
        ? "Contract source is verified"
        : "Contract source is not verified",
    };
    if (isVerified) score += 15;
    else score -= 5;

    return {
      score: Math.max(0, Math.min(100, score)),
      weight: 30,
      factors,
    };
  }

  private async analyzeLiquiditySafety(
    tokenAddress: string,
    metadata: any,
    depth: string,
  ): Promise<SafetyCategory> {
    const factors: any = {};
    let score = 100;

    // Check token supply
    const supply = await this.helius.getTokenSupply(tokenAddress);
    const hasSupply = supply && parseFloat(supply) > 0;
    factors["token_supply"] = {
      value: hasSupply,
      impact: hasSupply ? 0 : -100,
      description: hasSupply ? "Token has valid supply" : "Token has no supply",
    };
    if (!hasSupply) score = 0;

    // Check holder count
    const holders = await this.helius.getTokenHolders(
      tokenAddress,
      depth === "comprehensive" ? 100 : 20,
    );
    const holderCount = holders.length;
    factors["holder_count"] = {
      value: holderCount,
      impact:
        holderCount > 50
          ? 10
          : holderCount > 10
            ? 5
            : holderCount > 0
              ? -10
              : -20,
      description: `${holderCount} holders`,
    };
    if (holderCount > 50) score += 10;
    else if (holderCount > 10) score += 5;
    else if (holderCount > 0) score -= 10;
    else score -= 20;

    // Check for liquidity pools (would use DEX APIs in production)
    const hasLiquidityPools = await this.hasLiquidityPools(tokenAddress);
    factors["liquidity_pools"] = {
      value: hasLiquidityPools,
      impact: hasLiquidityPools ? 20 : -40,
      description: hasLiquidityPools
        ? "Token has liquidity pools"
        : "No liquidity pools found",
    };
    if (hasLiquidityPools) score += 20;
    else score -= 40;

    // Check liquidity depth (would use actual DEX data)
    const liquidityDepth = await this.getLiquidityDepth(tokenAddress);
    const hasGoodDepth = liquidityDepth > 10000; // $10k
    factors["liquidity_depth"] = {
      value: liquidityDepth,
      impact: hasGoodDepth ? 15 : -20,
      description: `$${liquidityDepth.toLocaleString()} liquidity depth`,
    };
    if (hasGoodDepth) score += 15;
    else score -= 20;

    return {
      score: Math.max(0, Math.min(100, score)),
      weight: 25,
      factors,
    };
  }

  private async analyzeDistributionSafety(
    tokenAddress: string,
    _metadata: any,
    _depth: string,
  ): Promise<SafetyCategory> {
    const factors: any = {};
    let score = 100;

    // Check top holder concentration
    const top10Holding = await this.getTop10Holding(tokenAddress);
    factors["top_10_holding"] = {
      value: top10Holding,
      impact:
        top10Holding > 80
          ? -30
          : top10Holding > 60
            ? -20
            : top10Holding > 40
              ? -10
              : top10Holding > 20
                ? 5
                : 10,
      description: `Top 10 holders control ${top10Holding}% of supply`,
    };
    if (top10Holding > 80) score -= 30;
    else if (top10Holding > 60) score -= 20;
    else if (top10Holding > 40) score -= 10;
    else if (top10Holding > 20) score += 5;
    else score += 10;

    // Check for single holder dominance
    const isSingleHolderDominated = top10Holding > 90;
    factors["single_holder_dominance"] = {
      value: isSingleHolderDominated,
      impact: isSingleHolderDominated ? -25 : 5,
      description: isSingleHolderDominated
        ? "Single holder dominates"
        : "Multiple holders",
    };
    if (isSingleHolderDominated) score -= 25;
    else score += 5;

    // Check distribution diversity (would use actual analysis)
    const distributionDiversity =
      await this.getDistributionDiversity(tokenAddress);
    const hasGoodDiversity = distributionDiversity > 0.7;
    factors["distribution_diversity"] = {
      value: distributionDiversity,
      impact: hasGoodDiversity ? 10 : -15,
      description: `${(distributionDiversity * 100).toFixed(1)}% distribution diversity`,
    };
    if (hasGoodDiversity) score += 10;
    else score -= 15;

    return {
      score: Math.max(0, Math.min(100, score)),
      weight: 20,
      factors,
    };
  }

  private async analyzeSocialSignals(
    tokenAddress: string,
    metadata: any,
    _depth: string,
  ): Promise<SafetyCategory> {
    const factors: any = {};
    let score = 50; // Default to neutral

    // Check external links
    const external = metadata.metadata?.external || {};
    const hasWebsite = !!external.website;
    const hasTwitter = !!external.twitter;
    const hasTelegram = !!external.telegram;

    factors["website"] = {
      value: hasWebsite,
      impact: hasWebsite ? 10 : -5,
      description: hasWebsite ? "Has website" : "No website",
    };
    if (hasWebsite) score += 10;
    else score -= 5;

    factors["twitter"] = {
      value: hasTwitter,
      impact: hasTwitter ? 10 : -5,
      description: hasTwitter ? "Has Twitter" : "No Twitter",
    };
    if (hasTwitter) score += 10;
    else score -= 5;

    factors["telegram"] = {
      value: hasTelegram,
      impact: hasTelegram ? 10 : -5,
      description: hasTelegram ? "Has Telegram" : "No Telegram",
    };
    if (hasTelegram) score += 10;
    else score -= 5;

    // Check social sentiment (would use social media APIs in production)
    const sentiment = await this.getSocialSentiment(tokenAddress);
    const sentimentScore = sentiment * 20; // Scale to 0-20
    factors["social_sentiment"] = {
      value: sentiment,
      impact: sentimentScore,
      description: `${(sentiment * 100).toFixed(1)}% positive sentiment`,
    };
    score += sentimentScore;

    // Check community engagement (would use actual metrics)
    const engagement = await this.getCommunityEngagement(tokenAddress);
    const hasGoodEngagement = engagement > 0.5;
    factors["community_engagement"] = {
      value: engagement,
      impact: hasGoodEngagement ? 10 : -10,
      description: `${(engagement * 100).toFixed(1)}% engagement rate`,
    };
    if (hasGoodEngagement) score += 10;
    else score -= 10;

    return {
      score: Math.max(0, Math.min(100, score)),
      weight: 15,
      factors,
    };
  }

  private async analyzeDeveloperReputation(
    tokenAddress: string,
    _metadata: any,
    _depth: string,
  ): Promise<SafetyCategory> {
    const factors: any = {};
    let score = 50; // Default to neutral

    // Check developer reputation (would use actual analysis)
    const reputation = await this.getDeveloperReputationScore(tokenAddress);
    const reputationScore = reputation * 0.6; // Scale to 0-60
    factors["developer_reputation"] = {
      value: reputation,
      impact: reputationScore - 30, // Center around 0
      description: `${(reputation * 100).toFixed(1)}% reputation score`,
    };
    score += reputationScore - 30;

    // Check developer history (would use actual analysis)
    const hasGoodHistory = await this.hasGoodDeveloperHistory(tokenAddress);
    factors["developer_history"] = {
      value: hasGoodHistory,
      impact: hasGoodHistory ? 15 : -20,
      description: hasGoodHistory
        ? "Good developer history"
        : "Poor developer history",
    };
    if (hasGoodHistory) score += 15;
    else score -= 20;

    // Check for rug pull history (would use actual analysis)
    const hasRugPullHistory = await this.hasRugPullHistory(tokenAddress);
    factors["rug_pull_history"] = {
      value: !hasRugPullHistory,
      impact: hasRugPullHistory ? -50 : 10,
      description: hasRugPullHistory
        ? "Has rug pull history"
        : "No rug pull history",
    };
    if (!hasRugPullHistory) score += 10;
    else score -= 50;

    return {
      score: Math.max(0, Math.min(100, score)),
      weight: 10,
      factors,
    };
  }

  private calculateOverallScore(categories: SafetyCategory[]): number {
    let totalScore = 0;
    let totalWeight = 0;

    for (const category of categories) {
      totalScore += category.score * category.weight;
      totalWeight += category.weight;
    }

    return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
  }

  private determineSafetyLevel(
    score: number,
  ): "safe" | "caution" | "risky" | "dangerous" {
    if (score >= 80) return "safe";
    if (score >= 60) return "caution";
    if (score >= 40) return "risky";
    return "dangerous";
  }

  private generateRedFlags(...categories: SafetyCategory[]): RedFlag[] {
    const redFlags: RedFlag[] = [];

    for (const category of categories) {
      for (const [factor, data] of Object.entries(category.factors)) {
        if (data.impact < -20) {
          redFlags.push({
            type: this.getRedFlagType(factor),
            severity: this.getRedFlagSeverity(data.impact),
            description: data.description,
          });
        }
      }
    }

    return redFlags;
  }

  private generateGreenFlags(...categories: SafetyCategory[]): GreenFlag[] {
    const greenFlags: GreenFlag[] = [];

    for (const category of categories) {
      for (const [factor, data] of Object.entries(category.factors)) {
        if (data.impact > 10) {
          greenFlags.push({
            type: this.getGreenFlagType(factor),
            description: data.description,
          });
        }
      }
    }

    return greenFlags;
  }

  private generateRecommendations(
    score: number,
    redFlags: RedFlag[],
    greenFlags: GreenFlag[],
  ): string[] {
    const recommendations: string[] = [];

    if (score < 30) {
      recommendations.push(
        "🚨 EXTREMELY HIGH RISK - This token appears to be a scam",
      );
      recommendations.push("❌ Avoid this token completely");
    } else if (score < 50) {
      recommendations.push("⚠️ HIGH RISK - Proceed with extreme caution");
      recommendations.push("📊 Do thorough research before investing");
    } else if (score < 70) {
      recommendations.push("⚡ MODERATE RISK - Be cautious");
      recommendations.push("🔍 Consider additional analysis");
    } else {
      recommendations.push("✅ RELATIVELY SAFE - Token appears legitimate");
      recommendations.push("📈 Monitor for changes");
    }

    // Specific recommendations based on red flags
    const criticalFlags = redFlags.filter(
      (flag) => flag.severity === "critical",
    );
    if (criticalFlags.length > 0) {
      recommendations.push("🚨 Critical issues detected - Avoid this token");
    }

    const securityFlags = redFlags.filter((flag) => flag.type === "security");
    if (securityFlags.length > 0) {
      recommendations.push("🔒 Security concerns - Review contract carefully");
    }

    const liquidityFlags = redFlags.filter((flag) => flag.type === "liquidity");
    if (liquidityFlags.length > 0) {
      recommendations.push("💧 Liquidity issues - Trading may be difficult");
    }

    // Add positive recommendations based on green flags
    if (greenFlags.length > 5) {
      recommendations.push("✅ Multiple positive indicators detected");
    }

    return recommendations;
  }

  private getRedFlagType(
    factor: string,
  ): "security" | "liquidity" | "distribution" | "social" | "technical" {
    if (
      factor.includes("mint") ||
      factor.includes("freeze") ||
      factor.includes("suspicious")
    ) {
      return "security";
    }
    if (factor.includes("liquidity") || factor.includes("pool")) {
      return "liquidity";
    }
    if (factor.includes("holder") || factor.includes("distribution")) {
      return "distribution";
    }
    if (factor.includes("social") || factor.includes("sentiment")) {
      return "social";
    }
    return "technical";
  }

  private getRedFlagSeverity(
    impact: number,
  ): "low" | "medium" | "high" | "critical" {
    if (impact <= -40) return "critical";
    if (impact <= -25) return "high";
    if (impact <= -15) return "medium";
    return "low";
  }

  private getGreenFlagType(
    factor: string,
  ): "security" | "liquidity" | "distribution" | "social" | "technical" {
    if (
      factor.includes("mint") ||
      factor.includes("freeze") ||
      factor.includes("verified")
    ) {
      return "security";
    }
    if (factor.includes("liquidity") || factor.includes("pool")) {
      return "liquidity";
    }
    if (factor.includes("holder") || factor.includes("distribution")) {
      return "distribution";
    }
    if (factor.includes("social") || factor.includes("engagement")) {
      return "social";
    }
    return "technical";
  }

  // Helper methods (would implement actual logic in production)
  private async checkSuspiciousFunctions(
    _tokenAddress: string,
  ): Promise<boolean> {
    // This would analyze the contract for suspicious functions
    return false;
  }

  private async getContractAge(_tokenAddress: string): Promise<number> {
    // This would get the creation time of the contract
    return Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago as mock
  }

  private async isContractVerified(_tokenAddress: string): Promise<boolean> {
    // This would check if the contract source is verified
    return false;
  }

  private async hasLiquidityPools(_tokenAddress: string): Promise<boolean> {
    // This would check DEX APIs for liquidity pools
    return false;
  }

  private async getLiquidityDepth(_tokenAddress: string): Promise<number> {
    // This would get actual liquidity depth from DEX APIs
    return 0;
  }

  private async getTop10Holding(_tokenAddress: string): Promise<number> {
    // This would calculate the actual top 10 holding percentage
    return 50;
  }

  private async getDistributionDiversity(
    _tokenAddress: string,
  ): Promise<number> {
    // This would calculate distribution diversity
    return 0.5;
  }

  private async getSocialSentiment(_tokenAddress: string): Promise<number> {
    // This would analyze social media sentiment
    return 0.5;
  }

  private async getCommunityEngagement(_tokenAddress: string): Promise<number> {
    // This would measure community engagement
    return 0.5;
  }

  private async getDeveloperReputationScore(
    _tokenAddress: string,
  ): Promise<number> {
    // This would check developer's history with other tokens
    return 0.5;
  }

  private async hasGoodDeveloperHistory(
    _tokenAddress: string,
  ): Promise<boolean> {
    // This would check developer's history with other tokens
    return false;
  }

  private async hasRugPullHistory(_tokenAddress: string): Promise<boolean> {
    // This would check if developer has rug pull history
    return false;
  }
}
