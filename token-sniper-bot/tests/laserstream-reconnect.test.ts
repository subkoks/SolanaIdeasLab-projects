import { getLaserStreamReconnectDelayMs } from '../src/utils/laserstream-reconnect'

describe('getLaserStreamReconnectDelayMs', () => {
  it('starts at base delay for first attempt', () => {
    expect(getLaserStreamReconnectDelayMs(1)).toBe(5_000)
  })

  it('doubles delay exponentially until cap', () => {
    expect(getLaserStreamReconnectDelayMs(2)).toBe(10_000)
    expect(getLaserStreamReconnectDelayMs(3)).toBe(20_000)
    expect(getLaserStreamReconnectDelayMs(5)).toBe(60_000)
    expect(getLaserStreamReconnectDelayMs(10)).toBe(60_000)
  })
})
