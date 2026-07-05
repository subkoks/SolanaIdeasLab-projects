import {
  countScansSince,
  isWithinScanLimit,
  SCAN_LIMITS_BY_TIER,
  startOfUtcDay,
} from '../src/utils/subscription-limits'

describe('subscription limits', () => {
  it('enforces free tier daily scan cap', () => {
    const since = startOfUtcDay(new Date('2026-07-05T15:00:00.000Z'))
    const scans = Array.from({ length: 10 }, (_, index) => ({
      userId: 'user-1',
      createdAt: new Date('2026-07-05T10:00:00.000Z').toISOString(),
      id: `scan-${index}`,
    }))

    expect(countScansSince(scans, 'user-1', since)).toBe(10)
    expect(isWithinScanLimit('free', 10)).toBe(false)
    expect(SCAN_LIMITS_BY_TIER.enterprise).toBe(-1)
  })
})
