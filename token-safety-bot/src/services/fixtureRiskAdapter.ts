export const FIXTURE_IDS = ["safe-token", "review-token", "blocked-token"] as const;
export type FixtureId = typeof FIXTURE_IDS[number];

export const FIXTURE_ADDRESSES: Record<FixtureId, string> = {
  "safe-token": "SoSafe11111111111111111111111111111111111112",
  "review-token": "SoReview1111111111111111111111111111111111",
  "blocked-token": "SoBlock11111111111111111111111111111111112",
};

// ---------------------------------------------------------------------------
// Explanation types
// ---------------------------------------------------------------------------

export type FixtureSignalSeverity = "positive" | "warning" | "critical";

export interface FixtureRiskSignal {
  id: string;
  severity: FixtureSignalSeverity;
  title: string;
  detail: string;
}

export interface FixtureRiskExplanation {
  summary: string;
  nextAction: string;
  signals: FixtureRiskSignal[];
}

// ---------------------------------------------------------------------------
// Deterministic fixture definitions — pure, no I/O
// ---------------------------------------------------------------------------

interface FixtureDefinition {
  tokenAddress: string;
  recommendation: "allow" | "review" | "block";
  safetyLevel: "safe" | "watch" | "risky" | "dangerous";
  score: number;
  source: "local-fixture";
  fixtureId: FixtureId;
  isSimulated: true;
  analysisDepth: "quick";
  explanation: FixtureRiskExplanation;
}

export interface FixtureRiskResult {
  tokenAddress: string;
  recommendation: "allow" | "review" | "block";
  safetyLevel: "safe" | "watch" | "risky" | "dangerous";
  score: number;
  source: "local-fixture";
  fixtureId: FixtureId;
  isSimulated: true;
  analysisDepth: "quick";
  explanation: FixtureRiskExplanation;
}

const FIXTURE_DEFINITIONS: Record<FixtureId, FixtureDefinition> = {
  "safe-token": {
    tokenAddress: FIXTURE_ADDRESSES["safe-token"],
    recommendation: "allow",
    safetyLevel: "safe",
    score: 92,
    source: "local-fixture",
    fixtureId: "safe-token",
    isSimulated: true,
    analysisDepth: "quick",
    explanation: {
      summary:
        "This simulated token profile represents a low-risk fixture in local development mode only. No real on-chain data was consulted.",
      nextAction: "Allow in this simulated workflow.",
      signals: [
        {
          id: "fixture-simulated-positive-signal",
          severity: "positive",
          title: "Simulated stable profile",
          detail:
            "This local fixture intentionally represents a safe, stable token profile for demonstration purposes only. No real token, blockchain, or contract data was evaluated.",
        },
        {
          id: "fixture-simulated-mint-authority",
          severity: "positive",
          title: "Simulated mint authority verified",
          detail:
            "In this synthetic fixture, mint authority is flagged as controlled. This is a fictional scenario used for local development — no real on-chain state was checked.",
        },
      ],
    },
  },

  "review-token": {
    tokenAddress: FIXTURE_ADDRESSES["review-token"],
    recommendation: "review",
    safetyLevel: "watch",
    score: 55,
    source: "local-fixture",
    fixtureId: "review-token",
    isSimulated: true,
    analysisDepth: "quick",
    explanation: {
      summary:
        "This simulated token profile represents a mixed-risk fixture in local development mode only. No real on-chain data was consulted.",
      nextAction: "Review before allowing.",
      signals: [
        {
          id: "fixture-simulated-unverified-contract",
          severity: "warning",
          title: "Simulated contract verification pending",
          detail:
            "This local fixture intentionally represents an unverified contract scenario for demonstration purposes only. No real contract source code or audit was consulted.",
        },
        {
          id: "fixture-simulated-owner-concentration",
          severity: "warning",
          title: "Simulated holder concentration detected",
          detail:
            "This synthetic fixture flags a simulated holder-concentration pattern. No real wallet balances, token distributions, or blockchain data were evaluated.",
        },
      ],
    },
  },

  "blocked-token": {
    tokenAddress: FIXTURE_ADDRESSES["blocked-token"],
    recommendation: "block",
    safetyLevel: "dangerous",
    score: 12,
    source: "local-fixture",
    fixtureId: "blocked-token",
    isSimulated: true,
    analysisDepth: "quick",
    explanation: {
      summary:
        "This simulated token profile represents a high-risk fixture in local development mode only. No real on-chain data was consulted.",
      nextAction: "Block in this simulated workflow.",
      signals: [
        {
          id: "fixture-simulated-high-risk-pattern",
          severity: "critical",
          title: "Simulated high-risk pattern",
          detail:
            "This local fixture intentionally represents a dangerous profile for demonstration purposes only. No real token, contract, wallet, or blockchain state was evaluated.",
        },
        {
          id: "fixture-simulated-blacklist-flag",
          severity: "critical",
          title: "Simulated blacklist flag",
          detail:
            "This synthetic fixture is flagged as simulating a blacklisted token pattern. No real blacklist, transaction history, or on-chain event was consulted.",
        },
      ],
    },
  },
};

export const isFixtureId = (v: unknown): v is FixtureId =>
  typeof v === "string" && (FIXTURE_IDS as readonly string[]).includes(v);

export const getFixtureRisk = (fixtureId: FixtureId): FixtureRiskResult => {
  // Deep-clone to prevent any accidental mutation from leaking into the definition map.
  const def = FIXTURE_DEFINITIONS[fixtureId];
  return JSON.parse(JSON.stringify(def)) as FixtureRiskResult;
};
