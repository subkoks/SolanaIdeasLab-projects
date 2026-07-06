export const LAMPORTS_PER_SOL = 1_000_000_000

export const lamportsToSol = (lamports: bigint | string): number => {
  const value = typeof lamports === 'string' ? BigInt(lamports) : lamports
  return Number(value) / LAMPORTS_PER_SOL
}

export const estimateUsdFromSol = (sol: number, solUsdPrice: number): number =>
  Math.round(sol * solUsdPrice * 100) / 100
