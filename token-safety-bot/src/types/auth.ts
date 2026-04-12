import type { Request } from 'express'

export type SubscriptionTier = 'free' | 'basic' | 'pro' | 'enterprise'

export interface AuthenticatedUser {
  id: string
  walletAddress: string
  subscriptionTier: SubscriptionTier
}

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser
}
