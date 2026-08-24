import type { SafetyScanResult } from "../src/services/safety-scanner";
import { toAgentRiskResponse } from "../src/utils/risk-response";

const buildResult = (
  overrides: Partial<SafetyScanResult> = {},
): SafetyScanResult => ({
  analysisDepth: "deep",
  greenFlags: ["SPL token program"],
  overallScore: 35,
  recommendations: ["Review liquidity before trading"],
  redFlags: Array.from({ length: 10 }, (_, index) => `red flag ${index}`),
  safetyLevel: "dangerous",
  scanTime: 42,
  scannedAt: "2026-08-21T12:00:00.000Z",
  summary: {
    blacklisted: false,
    contractAuthoritiesPresent: ["mintAuthority"],
    holderCount: 4,
    recentActivityCount: 2,
    tokenProgram: "spl-token",
    topHolderOwnershipRatio: 0.4,
  },
  tokenAddress: "So11111111111111111111111111111111111111112",
  ...overrides,
});

describe("toAgentRiskResponse", () => {
  it("maps dangerous scans to bounded, provenance-bearing block responses", () => {
    const response = toAgentRiskResponse(
      buildResult({
        redFlags: [
          "x".repeat(300),
          ...Array.from({ length: 9 }, (_, index) => `red flag ${index}`),
        ],
      }),
    );

    expect(response.schemaVersion).toBe("1");
    expect(response.decision).toEqual({
      recommendation: "block",
      safetyLevel: "dangerous",
      score: 35,
    });
    expect(response.signals.redFlags).toHaveLength(8);
    expect(response.signals.redFlags[0]).toHaveLength(240);
    expect(response.signals.truncated).toBe(true);
    expect(response.provenance.sources).toEqual([
      {
        id: "local-blacklist",
        fields: ["blacklisted"],
        observedAt: "2026-08-21T12:00:00.000Z",
      },
      {
        id: "solana-rpc",
        fields: [
          "tokenProgram",
          "contractAuthoritiesPresent",
          "holderCount",
          "recentActivityCount",
          "topHolderOwnershipRatio",
        ],
        observedAt: "2026-08-21T12:00:00.000Z",
      },
    ]);
  });

  it("does not claim RPC provenance for blacklist overrides", () => {
    const response = toAgentRiskResponse(
      buildResult({
        overallScore: 0,
        redFlags: ["Token is blacklisted"],
        safetyLevel: "dangerous",
        summary: {
          ...buildResult().summary,
          blacklisted: true,
          holderCount: 0,
          recentActivityCount: 0,
          tokenProgram: "unknown",
        },
      }),
    );

    expect(response.provenance.sources.map((source) => source.id)).toEqual([
      "local-blacklist",
    ]);
  });
});
