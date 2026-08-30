import { Keypair } from '@solana/web3.js'
import nacl from 'tweetnacl'
import { WalletAuth, AuthUser, verifyEd25519 } from '../auth/wallet-auth'

const TEST_SECRET = 'test-jwt-secret-at-least-16-characters'

function makeWallet(keypair: Keypair) {
  return {
    publicKey: keypair.publicKey,
    async signMessage(message: Uint8Array): Promise<Uint8Array> {
      return nacl.sign.detached(message, keypair.secretKey)
    },
  }
}

describe('WalletAuth — Ed25519 challenge verification (real crypto)', () => {
  it('accepts a valid signature produced by the claimed wallet', async () => {
    const kp = Keypair.generate()
    const auth = new WalletAuth({} as any, TEST_SECRET)
    const wallet = makeWallet(kp)
    const session = await auth.authenticateWallet(wallet)
    expect(session.token).toBeTruthy()
    expect(session.user.wallet).toBe(kp.publicKey.toBase58())
  })

  it('rejects when the signature does not match the public key', async () => {
    const honest = Keypair.generate()
    const attacker = Keypair.generate()
    const auth = new WalletAuth({} as any, TEST_SECRET)
    // Attacker signs a challenge for honest's address; verified against honest's key -> false
    const message = auth.buildChallenge(honest.publicKey.toBase58())
    const signature = nacl.sign.detached(new TextEncoder().encode(message), attacker.secretKey)
    expect(verifyEd25519(honest.publicKey, new TextEncoder().encode(message), signature)).toBe(false)
  })

  it('throws when wallet is not connected', async () => {
    const auth = new WalletAuth({} as any, TEST_SECRET)
    await expect(
      auth.authenticateWallet({ publicKey: null, signMessage: async () => new Uint8Array() } as any),
    ).rejects.toThrow('Wallet not connected')
  })

  it('rejects a trivial jwt secret at construction', () => {
    expect(() => new WalletAuth({} as any, 'short')).toThrow(/jwtSecret/)
  })
})

describe('WalletAuth — JWT HS256 sign/verify (real crypto)', () => {
  it('round-trips a token and recovers the user', () => {
    const kp = Keypair.generate()
    const auth = new WalletAuth({} as any, TEST_SECRET)
    const user: AuthUser = {
      id: kp.publicKey.toBase58(),
      wallet: kp.publicKey.toBase58(),
      publicKey: kp.publicKey,
      subscriptionTier: 'pro',
      createdAt: new Date(),
      lastActive: new Date(),
    }
    const token = auth.createJWT(user)
    expect(token.split('.')).toHaveLength(3)

    const recovered = auth.verifyToken(token)
    expect(recovered).not.toBeNull()
    expect(recovered!.wallet).toBe(kp.publicKey.toBase58())
    expect(recovered!.subscriptionTier).toBe('pro')
  })

  it('returns null for a tampered token', () => {
    const kp = Keypair.generate()
    const auth = new WalletAuth({} as any, TEST_SECRET)
    const user: AuthUser = {
      id: kp.publicKey.toBase58(),
      wallet: kp.publicKey.toBase58(),
      publicKey: kp.publicKey,
      subscriptionTier: 'free',
      createdAt: new Date(),
      lastActive: new Date(),
    }
    const token = auth.createJWT(user)
    const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa')
    expect(auth.verifyToken(tampered)).toBeNull()
  })

  it('returns null for an expired token', () => {
    const kp = Keypair.generate()
    const auth = new WalletAuth({} as any, TEST_SECRET)
    const user: AuthUser = {
      id: kp.publicKey.toBase58(),
      wallet: kp.publicKey.toBase58(),
      publicKey: kp.publicKey,
      subscriptionTier: 'free',
      createdAt: new Date(),
      lastActive: new Date(),
    }
    const token = auth.createJWT(user, -1000) // already expired
    expect(auth.verifyToken(token)).toBeNull()
  })

  it('returns null for a token signed with a different secret', () => {
    const kp = Keypair.generate()
    const authA = new WalletAuth({} as any, TEST_SECRET)
    const authB = new WalletAuth({} as any, 'a-different-secret-also-16+')
    const user: AuthUser = {
      id: kp.publicKey.toBase58(),
      wallet: kp.publicKey.toBase58(),
      publicKey: kp.publicKey,
      subscriptionTier: 'free',
      createdAt: new Date(),
      lastActive: new Date(),
    }
    const token = authA.createJWT(user)
    expect(authB.verifyToken(token)).toBeNull()
  })
})

describe('WalletAuth — integration: challenge then verify', () => {
  it('produces a token that verifyToken accepts (full happy path)', async () => {
    const kp = Keypair.generate()
    const auth = new WalletAuth({} as any, TEST_SECRET)
    const session = await auth.authenticateWallet(makeWallet(kp))
    const verified = auth.verifyToken(session.token)
    expect(verified).not.toBeNull()
    expect(verified!.wallet).toBe(kp.publicKey.toBase58())
  })
})
