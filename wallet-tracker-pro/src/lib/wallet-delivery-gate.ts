// Intentionally source-controlled and disabled: see docs/WALLET-DELIVERY.md.
// An environment variable cannot bypass the migration + disposable-Postgres gate.
export const WALLET_DELIVERY_SCHEMA_VERIFIED = false

export const assertWalletDeliveryReady = (): void => {
  if (!WALLET_DELIVERY_SCHEMA_VERIFIED) {
    throw new Error('Wallet delivery is disabled pending reviewed migration and runtime activation')
  }
}
