import { AuthUser, SubscriptionTier } from '../auth/wallet-auth'

/**
 * Maps the canonical `@solanaideaslab/shared` `AuthUser` onto the shape the
 * individual bots already expect (`AuthenticatedUser` with `walletAddress`).
 * Pure mapping — no I/O, no secrets. Lets a bot adopt the shared auth module
 * without rewriting its route handlers.
 */
export interface BotAuthenticatedUser {
  id: string
  walletAddress: string
  subscriptionTier: SubscriptionTier
}

export function toBotUser(user: AuthUser): BotAuthenticatedUser {
  return {
    id: user.id,
    walletAddress: user.wallet,
    subscriptionTier: user.subscriptionTier,
  }
}
