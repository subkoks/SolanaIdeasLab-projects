jest.mock('../src/lib/config', () => ({ config: {} }))
jest.mock('../src/lib/billing', () => ({ getBillingStatus: jest.fn(), isBillingMockMode: jest.fn(), resolveSubscriberCheckoutSession: jest.fn() }))
jest.mock('../src/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}))

import { WalletTrackerTelegramBot, walletMutationErrorMessage } from '../src/services/telegram-bot'

describe('Telegram delivery acknowledgements', () => {
  const fixture = () => {
    const sendMessage = jest.fn().mockResolvedValue({ message_id: 42, chat: { id: -101 } })
    return { sendMessage, bot: new WalletTrackerTelegramBot({ telegram: { sendMessage } } as never, {} as never, {} as never) }
  }

  it('returns only a validated receipt for the requested recipient', async () => {
    const { bot, sendMessage } = fixture()
    expect(await bot.notifyChat('-101', 'Synthetic message')).toEqual({ messageId: '42' })
    expect(sendMessage).toHaveBeenCalledWith('-101', 'Synthetic message')
  })

  it.each([{}, { message_id: 0, chat: { id: -101 } }, { message_id: 42, chat: { id: -102 } }, { message_id: Number.MAX_SAFE_INTEGER + 1, chat: { id: -101 } }])('rejects missing/mismatched/unsafe ACKs: %p', async (ack) => {
    const { bot, sendMessage } = fixture()
    sendMessage.mockResolvedValue(ack)
    await expect(bot.notifyChat('-101', 'Synthetic message')).rejects.toThrow('acknowledgement unavailable')
  })

  it('rejects malformed recipients before calling Telegram', async () => {
    const { bot, sendMessage } = fixture()
    await expect(bot.notifyChat('NaN', 'Synthetic message')).rejects.toThrow('Invalid Telegram recipient')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('maps ledger mutation codes to actionable user messages', () => {
    const error = Object.assign(new Error('Wallet ingestion held: invalid-batch'), {
      name: 'WalletIngestionError',
      code: 'invalid-batch',
    })

    expect(walletMutationErrorMessage(error)).toBe(
      'Could not update this watch. Check the wallet and label, then try again.',
    )
  })

  it('preserves actionable non-ledger watch errors', () => {
    expect(walletMutationErrorMessage(new Error('Watch limit reached (3 on free tier)'))).toBe(
      'Watch limit reached (3 on free tier)',
    )
  })
})
