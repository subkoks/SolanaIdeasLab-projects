jest.mock('telegraf', () => ({ Telegraf: jest.fn() }))
jest.mock('../src/services/database', () => ({ DatabaseService: jest.fn() }))
jest.mock('../src/services/solana-watcher', () => ({ SolanaWatcherService: jest.fn() }))
jest.mock('../src/services/telegram-bot', () => ({ WalletTrackerTelegramBot: jest.fn() }))
jest.mock('../src/lib/config', () => ({ config: {}, isTelegramEnabled: () => true }))
jest.mock('../src/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}))

import { DatabaseService } from '../src/services/database'
import { SolanaWatcherService } from '../src/services/solana-watcher'
import { Telegraf } from 'telegraf'
import { assertWalletDeliveryReady, WALLET_DELIVERY_SCHEMA_VERIFIED } from '../src/lib/wallet-delivery-gate'

describe('Wallet runtime activation gate', () => {
  it('remains disabled independently of environment configuration', () => {
    expect(WALLET_DELIVERY_SCHEMA_VERIFIED).toBe(false)
    expect(assertWalletDeliveryReady).toThrow('reviewed migration and runtime activation')
  })

  it('fails bot startup before constructing or connecting any service', async () => {
    const { main } = require('../src/bot/index') as typeof import('../src/bot/index')
    await expect(main()).rejects.toThrow('reviewed migration and runtime activation')
    expect(DatabaseService).not.toHaveBeenCalled()
    expect(SolanaWatcherService).not.toHaveBeenCalled()
    expect(Telegraf).not.toHaveBeenCalled()
  })
})
