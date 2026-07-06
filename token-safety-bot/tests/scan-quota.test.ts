import { getScanQuota } from '../src/utils/scan-quota'

describe('getScanQuota', () => {
  it('returns remaining scans for free tier', () => {
    const scans = Array.from({ length: 3 }, (_, index) => ({
      userId: 'user-1',
      createdAt: new Date().toISOString(),
      id: `scan-${index}`,
    }))

    const quota = getScanQuota('free', scans, 'user-1')

    expect(quota.usedToday).toBe(3)
    expect(quota.remaining).toBe(7)
    expect(quota.withinLimit).toBe(true)
  })
})
