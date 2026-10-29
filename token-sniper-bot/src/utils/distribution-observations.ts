import type { TokenLargestAccount } from "../services/helius";
import { TokenObservationUnavailableError } from "./token-observation-error";

export interface DistributionEvidence {
  basis: "mint-supply";
  accountBasis: "token-accounts";
  supplyRawAmount: string;
  sampledRawAmount: string;
  top10RawAmount: string;
  sampledAccountCount: number;
  positiveSampledAccountCount: number;
  sampleLimit: 20;
  completeHolderCount: false;
  liquidityPoolVerified: false;
  percentageRounding: "up-to-0.01-percent";
}

export const calculateDistribution = (supply: string, accounts: Array<TokenLargestAccount>): {
  percentage: number; evidence: DistributionEvidence;
} => {
  const total = BigInt(supply);
  const amounts = accounts.map(account => BigInt(account.amount))
    .sort((left, right) => left > right ? -1 : left < right ? 1 : 0);
  const sampled = amounts.reduce((sum, amount) => sum + amount, 0n);
  // Zero supply needs an explicit alternative model, not a guessed percentage.
  if (total <= 0n || sampled <= 0n || sampled > total) throw new TokenObservationUnavailableError();
  const top10 = amounts.slice(0, 10).reduce((sum, amount) => sum + amount, 0n);
  // Ceiling preserves strict comparisons against integer score thresholds.
  const percentage = Number((top10 * 10_000n + total - 1n) / total) / 100;
  return { percentage, evidence: {
    basis: "mint-supply", accountBasis: "token-accounts", supplyRawAmount: total.toString(),
    sampledRawAmount: sampled.toString(), top10RawAmount: top10.toString(),
    sampledAccountCount: amounts.length, positiveSampledAccountCount: amounts.filter(amount => amount > 0n).length,
    sampleLimit: 20, completeHolderCount: false, liquidityPoolVerified: false, percentageRounding: "up-to-0.01-percent",
  } };
};
