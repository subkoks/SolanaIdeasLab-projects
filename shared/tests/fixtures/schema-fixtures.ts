// Local-only fixtures for the shared database schema smoke tests.
// No real database credentials, no external services, no migrations, no prod data.

export interface SchemaFixtureUser {
  walletAddress: string
  email: string
  subscriptionTier: 'free' | 'basic' | 'pro' | 'enterprise'
}

// A syntactically valid 44-char base58 wallet address (ed25519 pubkey length).
export const VALID_WALLET = '11111111111111111111111111111111111111111111'

export const VALID_USER: SchemaFixtureUser = {
  walletAddress: VALID_WALLET,
  email: 'fixture@example.com',
  subscriptionTier: 'pro',
}

export const INVALID_TIER = 'platinum' // not in the CHECK enum

// Alternate 44-char wallets used for uniqueness / FK smoke tests.
export const ALT_WALLET_A = '22222222222222222222222222222222222222222222'
export const ALT_WALLET_B = '33333333333333333333333333333333333333333333'
