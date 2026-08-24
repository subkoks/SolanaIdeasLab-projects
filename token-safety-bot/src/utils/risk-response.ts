import type {
  AnalysisDepth,
  SafetyLevel,
  SafetyScanResult,
} from "../services/safety-scanner";

const MAX_SIGNAL_COUNT = 8;
const MAX_SIGNAL_LENGTH = 240;
const MAX_AUTHORITY_COUNT = 8;

export type RiskRecommendation = "allow" | "review" | "block";

export interface BoundedSignals {
  greenFlags: Array<string>;
  recommendations: Array<string>;
  redFlags: Array<string>;
  truncated: boolean;
}

export interface AgentRiskResponse {
  decision: {
    recommendation: RiskRecommendation;
    safetyLevel: SafetyLevel;
    score: number;
  };
  evidence: {
    blacklisted: boolean;
    contractAuthoritiesPresent: Array<string>;
    holderCount: number;
    recentActivityCount: number;
    tokenProgram: SafetyScanResult["summary"]["tokenProgram"];
    topHolderOwnershipRatio: number;
  };
  provenance: {
    analysisDepth: AnalysisDepth;
    generatedAt: string;
    sources: Array<{
      fields: Array<string>;
      id: "local-blacklist" | "solana-rpc";
      observedAt: string;
    }>;
  };
  schemaVersion: "1";
  signals: BoundedSignals;
  tokenAddress: string;
}

const toRecommendation = (safetyLevel: SafetyLevel): RiskRecommendation => {
  if (safetyLevel === "safe") {
    return "allow";
  }

  if (safetyLevel === "dangerous") {
    return "block";
  }

  return "review";
};

const boundStrings = (
  values: Array<string>,
  maxCount: number,
): { truncated: boolean; values: Array<string> } => {
  const bounded = values
    .slice(0, maxCount)
    .map((value) => value.slice(0, MAX_SIGNAL_LENGTH));
  const truncated =
    values.length > maxCount ||
    values.some((value) => value.length > MAX_SIGNAL_LENGTH);

  return { truncated, values: bounded };
};

const buildSignals = (result: SafetyScanResult): BoundedSignals => {
  const greenFlags = boundStrings(result.greenFlags, MAX_SIGNAL_COUNT);
  const recommendations = boundStrings(
    result.recommendations,
    MAX_SIGNAL_COUNT,
  );
  const redFlags = boundStrings(result.redFlags, MAX_SIGNAL_COUNT);

  return {
    greenFlags: greenFlags.values,
    recommendations: recommendations.values,
    redFlags: redFlags.values,
    truncated:
      greenFlags.truncated || recommendations.truncated || redFlags.truncated,
  };
};

export const toAgentRiskResponse = (
  result: SafetyScanResult,
): AgentRiskResponse => {
  const sourceFields = [
    "tokenProgram",
    "contractAuthoritiesPresent",
    "holderCount",
    "recentActivityCount",
    "topHolderOwnershipRatio",
  ];

  return {
    schemaVersion: "1",
    tokenAddress: result.tokenAddress,
    decision: {
      recommendation: toRecommendation(result.safetyLevel),
      safetyLevel: result.safetyLevel,
      score: result.overallScore,
    },
    evidence: {
      blacklisted: result.summary.blacklisted,
      contractAuthoritiesPresent:
        result.summary.contractAuthoritiesPresent.slice(0, MAX_AUTHORITY_COUNT),
      holderCount: result.summary.holderCount,
      recentActivityCount: result.summary.recentActivityCount,
      tokenProgram: result.summary.tokenProgram,
      topHolderOwnershipRatio: result.summary.topHolderOwnershipRatio,
    },
    signals: buildSignals(result),
    provenance: {
      analysisDepth: result.analysisDepth,
      generatedAt: result.scannedAt,
      sources: [
        {
          id: "local-blacklist",
          fields: ["blacklisted"],
          observedAt: result.scannedAt,
        },
        ...(result.summary.blacklisted
          ? []
          : [
              {
                id: "solana-rpc" as const,
                fields: sourceFields,
                observedAt: result.scannedAt,
              },
            ]),
      ],
    },
  };
};
