import type { SubscriberTier } from './watch-limits'

export interface SubscriberTierSyncPayload {
  chatId: string
  tier: SubscriberTier
  status: 'active' | 'cancelled'
}

export const applySubscriberTierSync = async (
  upsertSubscriber: (chatId: string) => Promise<unknown>,
  setSubscriberTier: (chatId: string, tier: string) => Promise<unknown>,
  payload: SubscriberTierSyncPayload,
): Promise<void> => {
  await upsertSubscriber(payload.chatId)
  await setSubscriberTier(
    payload.chatId,
    payload.status === 'cancelled' ? 'free' : payload.tier,
  )
}
