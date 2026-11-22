/**
 * @jest-environment node
 */
import { startWalletRuntime } from '../src/bot/index'

describe('Wallet runtime startup', () => {
  it('starts polling before Telegram long polling begins', async () => {
    const launch = jest.fn(() => new Promise<void>(() => undefined))
    const pollWatchlist = jest.fn().mockResolvedValue(undefined)
    const setIntervalSpy = jest.spyOn(global, 'setInterval')
    const runtime = {
      database: {
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        deliveryLedger: {},
      },
      watcher: { pollWatchlist },
      bot: {
        registerCommands: jest.fn(),
        launch,
        stop: jest.fn(),
        notifyChat: jest.fn().mockResolvedValue({ messageId: '42' }),
      },
    }

    try {
      void startWalletRuntime(runtime, {
        pollIntervalMs: 60_000,
        registerSignals: false,
      })
      await new Promise((resolve) => setImmediate(resolve))

      expect(pollWatchlist).toHaveBeenCalledTimes(1)
      expect(launch).toHaveBeenCalledTimes(1)
      expect(pollWatchlist.mock.invocationCallOrder[0]).toBeLessThan(
        launch.mock.invocationCallOrder[0]!,
      )
      const timer = setIntervalSpy.mock.results[0]?.value
      clearInterval(timer)
    } finally {
      setIntervalSpy.mockRestore()
    }
  })
})
