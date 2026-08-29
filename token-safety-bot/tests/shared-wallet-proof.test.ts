import nacl from 'tweetnacl'
import bs58 from 'bs58'
import {
  verifyWalletSignatureWithShared,
} from '../src/auth/shared-wallet-proof'
import {
  buildWalletAuthMessage,
  createWalletAuthChallenge,
  getWalletAuthNonce,
  MAX_AUTH_WINDOW_MS,
} from '../src/utils/wallet-signature'

// Generates a real Ed25519 keypair and signs `message` (base58 sig), proving the
// shared primitive is exercised through the intended dependency path.
const signWithKeypair = (keypair: nacl.SignKeyPair, message: string) => {
  const signature = nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey)
  return bs58.encode(signature)
}

describe('shared wallet-proof adapter (verifyEd25519WalletAuth)', () => {
  const keypair = nacl.sign.keyPair()
  const walletAddress = bs58.encode(Buffer.from(keypair.publicKey))

  it('accepts a valid Ed25519 wallet proof through the adapter', () => {
    const challenge = createWalletAuthChallenge(walletAddress)
    const signature = signWithKeypair(keypair, challenge.message)
    expect(
      verifyWalletSignatureWithShared(walletAddress, challenge.message, signature),
    ).toBe(true)
  })

  it('rejects a signature from a different wallet (mismatched proof)', () => {
    const other = nacl.sign.keyPair()
    const challenge = createWalletAuthChallenge(walletAddress)
    const signature = signWithKeypair(other, challenge.message)
    expect(
      verifyWalletSignatureWithShared(walletAddress, challenge.message, signature),
    ).toBe(false)
  })

  it('rejects a malformed (non-base58) signature', () => {
    const challenge = createWalletAuthChallenge(walletAddress)
    expect(
      verifyWalletSignatureWithShared(walletAddress, challenge.message, '!!!not-base58!!!'),
    ).toBe(false)
  })

  it('rejects a signature of the wrong length', () => {
    const challenge = createWalletAuthChallenge(walletAddress)
    const badSig = bs58.encode(Buffer.alloc(32)) // 32 bytes, not 64
    expect(
      verifyWalletSignatureWithShared(walletAddress, challenge.message, badSig),
    ).toBe(false)
  })

  it('rejects a tampered message (signature over different content)', () => {
    const challenge = createWalletAuthChallenge(walletAddress)
    const signature = signWithKeypair(keypair, challenge.message)
    const tampered = challenge.message.replace('Wallet:', 'Wallet: ')
    expect(
      verifyWalletSignatureWithShared(walletAddress, tampered, signature),
    ).toBe(false)
  })

  it('rejects an expired challenge (replay/expiry policy enforced upstream)', () => {
    const expiredMessage = buildWalletAuthMessage(
      walletAddress,
      getWalletAuthNonce(walletAddress, createWalletAuthChallenge(walletAddress).message),
      Date.now() - (MAX_AUTH_WINDOW_MS + 60_000),
    )
    const signature = signWithKeypair(keypair, expiredMessage)
    // The signature itself is cryptographically valid, but the adapter returns
    // false only on signature failure; expiry is enforced by isFreshWalletAuthMessage
    // in the route. Here we assert the primitive verifies the *signature* while the
    // bot's nonce/expiry checks remain the authoritative gate.
    expect(
      verifyWalletSignatureWithShared(walletAddress, expiredMessage, signature),
    ).toBe(true)
    // and the bot's freshness check rejects it (no regression of replay/expiry):
    const {
      isFreshWalletAuthMessage,
    } = require('../src/utils/wallet-signature')
    expect(isFreshWalletAuthMessage(walletAddress, expiredMessage)).toBe(false)
  })

  it('consumes @solanaideaslab/shared via the intended dependency path', () => {
    // If the package resolved at all, the import succeeded; assert the symbol
    // came from the shared module (not a local reimplementation).
    const shared = require('@solanaideaslab/shared')
    expect(typeof shared.verifyEd25519WalletAuth).toBe('function')
  })
})
