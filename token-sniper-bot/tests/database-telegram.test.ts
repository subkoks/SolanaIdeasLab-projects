import { parseTelegramChatId, telegramUserId } from '../src/utils/telegram-user'

describe('telegram user helpers', () => {
  it('prefixes chat ids for wallet address mapping', () => {
    expect(telegramUserId(12345)).toBe('telegram:12345')
  })

  it('parses chat ids from telegram wallet addresses', () => {
    expect(parseTelegramChatId('telegram:12345')).toBe(12345)
    expect(parseTelegramChatId('wallet-abc')).toBeNull()
  })
})
