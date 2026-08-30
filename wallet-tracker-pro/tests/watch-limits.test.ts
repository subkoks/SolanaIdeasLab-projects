import { getWatchLimitForTier, isValidSubscriberTier } from '../src/lib/watch-limits'
import { estimateUsdFromSol, lamportsToSol } from '../src/lib/portfolio'

describe('watch limits', () => {
  it('maps tiers to watch caps', () => {
    expect(getWatchLimitForTier('free')).toBe(3)
    expect(getWatchLimitForTier('pro')).toBe(25)
    expect(getWatchLimitForTier('unknown')).toBe(3)
  })

  it('validates subscriber tiers', () => {
    expect(isValidSubscriberTier('free')).toBe(true)
    expect(isValidSubscriberTier('enterprise')).toBe(true)
    expect(isValidSubscriberTier('platinum')).toBe(false)
    expect(isValidSubscriberTier('')).toBe(false)
  })
})

describe('portfolio helpers', () => {
  it('converts lamports to SOL and estimates USD', () => {
    expect(lamportsToSol('1000000000')).toBe(1)
    expect(estimateUsdFromSol(2, 150)).toBe(300)
  })
})
