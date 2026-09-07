export const FIXTURE_IDS = ["safe-token", "review-token", "blocked-token"] as const;
export type FixtureId = typeof FIXTURE_IDS[number];

export const FIXTURE_ADDRESSES: Record<FixtureId, string> = {
  "safe-token": "SoSafe11111111111111111111111111111111111112",
  "review-token": "SoReview1111111111111111111111111111111111",
  "blocked-token": "SoBlock11111111111111111111111111111111112",
};

export interface FixtureRiskResult {
  tokenAddress: string;
  recommendation: "allow" | "review" | "block";
  safetyLevel: "safe" | "watch" | "risky" | "dangerous";
  score: number;
  source: "local-fixture";
  fixtureId: FixtureId;
  isSimulated: true;
  analysisDepth: "quick";
}

export const isFixtureId = (v: unknown): v is FixtureId =>
  typeof v === "string" && (FIXTURE_IDS as readonly string[]).includes(v);

export const getFixtureRisk = (fixtureId: FixtureId): FixtureRiskResult => {
  const tokenAddress = FIXTURE_ADDRESSES[fixtureId];
  if (fixtureId === "safe-token") return { tokenAddress, recommendation: "allow", safetyLevel: "safe", score: 92, source: "local-fixture", fixtureId, isSimulated: true, analysisDepth: "quick" };
  if (fixtureId === "review-token") return { tokenAddress, recommendation: "review", safetyLevel: "watch", score: 55, source: "local-fixture", fixtureId, isSimulated: true, analysisDepth: "quick" };
  return { tokenAddress, recommendation: "block", safetyLevel: "dangerous", score: 12, source: "local-fixture", fixtureId, isSimulated: true, analysisDepth: "quick" };
};
