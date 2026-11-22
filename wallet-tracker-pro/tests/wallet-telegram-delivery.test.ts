jest.mock('../src/lib/config', () => ({ config: {} }))
jest.mock('../src/lib/billing', () => ({ getBillingStatus: jest.fn(), isBillingMockMode: jest.fn(), resolveSubscriberCheckoutSession: jest.fn() }))
jest.mock('../src/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}))

import { WalletTrackerTelegramBot, walletMutationErrorMessage } from '../src/services/telegram-bot'
import {
  dispatchPendingDeliveries,
  telegramRetryAfterMs,
  WalletIngestionError,
  WalletLimitReachedError,
} from '../src/services/wallet-delivery-ledger'
import { deliveryStore } from './helpers/wallet-delivery'

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
    const error = new WalletIngestionError('invalid-batch')

    expect(walletMutationErrorMessage(error)).toBe(
      'Could not update this watch. Check the wallet and label, then try again.',
    )
  })

  it('preserves the typed watch-limit message', () => {
    expect(walletMutationErrorMessage(new WalletLimitReachedError(3, 'free'))).toBe(
      'Watch limit reached (3 on free tier)',
    )
  })

  it('does not expose unexpected database errors to Telegram users', () => {
    expect(walletMutationErrorMessage(new Error('password authentication failed for user postgres'))).toBe(
      'Could not update this watch. Please try again.',
    )
  })

  it('paces successive sends to one chat', async () => {
    const store = deliveryStore()
    store.listPendingIds.mockResolvedValue(['delivery-1', 'delivery-2'])
    store.claim.mockImplementation(async (id: string) => ({
      id,
      claimToken: `claim-${id}`,
      chatId: '101',
      message: `Message ${id}`,
    }))
    let currentTime = 1_000
    const waits: number[] = []
    const sentAt: number[] = []
    await dispatchPendingDeliveries(
      store,
      async () => {
        sentAt.push(currentTime)
        return { messageId: String(sentAt.length) }
      },
      {
        minChatIntervalMs: 1_000,
        now: () => currentTime,
        wait: async (milliseconds) => {
          waits.push(milliseconds)
          currentTime += milliseconds
        },
        chatLastSentAt: new Map(),
      },
    )
    expect(waits).toEqual([1_000])
    expect(sentAt).toEqual([1_000, 2_000])
  })

  it('returns an explicit Telegram rate limit to pending with retry_after', async () => {
    const store = deliveryStore()
    const error = Object.assign(new Error('Too Many Requests'), {
      code: 429,
      parameters: { retry_after: 7 },
    })
    expect(telegramRetryAfterMs(error)).toBe(7_000)
    await dispatchPendingDeliveries(
      store,
      async () => {
        throw error
      },
      { minChatIntervalMs: 0, chatLastSentAt: new Map() },
    )
    expect(store.markRateLimited).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'delivery-1' }),
      7_000,
    )
    expect(store.markUncertain).not.toHaveBeenCalled()
  })
})
