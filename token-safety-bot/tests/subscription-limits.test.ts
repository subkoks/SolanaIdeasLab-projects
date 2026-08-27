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

  it('countScansSince filters by userId and the since cutoff', () => {
    const since = new Date('2026-07-05T00:00:00.000Z')
    const scans = [
      { userId: 'user-1', createdAt: '2026-07-05T01:00:00.000Z' },
      { userId: 'user-2', createdAt: '2026-07-05T02:00:00.000Z' }, // different user
      { userId: 'user-1', createdAt: '2026-07-04T23:59:59.000Z' }, // before cutoff
      { userId: 'user-1', createdAt: '2026-07-06T00:00:00.000Z' },
    ]
    expect(countScansSince(scans, 'user-1', since)).toBe(2)
    expect(countScansSince(scans, 'user-2', since)).toBe(1)
  })

  it('isWithinScanLimit treats enterprise (-1) as unlimited and enforces strict less-than', () => {
    expect(isWithinScanLimit('enterprise', 9999)).toBe(true)
    expect(isWithinScanLimit('free', 0)).toBe(true)
    expect(isWithinScanLimit('free', 9)).toBe(true)
    expect(isWithinScanLimit('free', 10)).toBe(false) // at limit -> blocked
    expect(isWithinScanLimit('basic', 100)).toBe(false)
    expect(isWithinScanLimit('pro', 499)).toBe(true)
  })

  it('startOfUtcDay returns UTC midnight', () => {
    const d = startOfUtcDay(new Date('2026-07-05T15:42:17.123Z'))
    expect(d.toISOString()).toBe('2026-07-05T00:00:00.000Z')
  })
})
