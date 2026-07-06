import { AlertNotificationThrottle } from '../src/utils/alert-throttle'

describe('AlertNotificationThrottle', () => {
  it('dedupes identical alerts within the dedupe window', () => {
    const throttle = new AlertNotificationThrottle(60_000, 60_000, 10)

    expect(throttle.shouldNotify(1, 'mint-a', 'risk_change')).toBe(true)
    expect(throttle.shouldNotify(1, 'mint-a', 'risk_change')).toBe(false)
    expect(throttle.shouldNotify(1, 'mint-a', 'whale_activity')).toBe(true)
  })

  it('rate limits per chat id', () => {
    const throttle = new AlertNotificationThrottle(0, 60_000, 2)

    expect(throttle.shouldNotify(99, 'mint-a', 'launch')).toBe(true)
    expect(throttle.shouldNotify(99, 'mint-b', 'launch')).toBe(true)
    expect(throttle.shouldNotify(99, 'mint-c', 'launch')).toBe(false)
  })
})
