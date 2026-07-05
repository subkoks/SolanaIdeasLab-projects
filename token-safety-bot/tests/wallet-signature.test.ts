import { verifyWalletSignature } from '../src/utils/wallet-signature'

describe('verifyWalletSignature', () => {
  it('rejects malformed signatures', () => {
    expect(
      verifyWalletSignature(
        'So11111111111111111111111111111111111111112',
        'Sign in to TokenSafetyBot',
        'not-a-valid-signature',
      ),
    ).toBe(false)
  })
})
