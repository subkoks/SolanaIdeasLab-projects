import { telegramUserId } from '../src/utils/telegram-user'

describe('telegramUserId', () => {
  it('prefixes chat ids for wallet address mapping', () => {
    expect(telegramUserId(12345)).toBe('telegram:12345')
  })
})
