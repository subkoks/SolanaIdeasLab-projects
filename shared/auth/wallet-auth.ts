import { Connection, PublicKey } from '@solana/web3.js'
import crypto from 'crypto'

export type SubscriptionTier = 'free' | 'basic' | 'pro' | 'enterprise'

export interface AuthUser {
  id: string
  wallet: string
  publicKey: PublicKey
  subscriptionTier: SubscriptionTier
  createdAt: Date
  lastActive: Date
}

export interface AuthSession {
  token: string
  user: AuthUser
  expiresAt: Date
}

export interface WalletAdapterLike {
  publicKey: PublicKey | null
  signMessage(message: Uint8Array): Promise<Uint8Array>
}

const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replaceAll('=', '')
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

/**
 * Build an Ed25519 JWK public key from a Solana PublicKey.
 * Solana public keys are 32 raw bytes; Node's WebCrypto verifies Ed25519
 * signatures when the key is provided as an OKP/JWK key object.
 */
function publicKeyToJwk(publicKey: PublicKey): crypto.KeyObject {
  const raw = Buffer.from(publicKey.toBytes())
  const jwk = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: raw.toString('base64url'),
  }
  return crypto.createPublicKey({ key: jwk, format: 'jwk' })
}

/**
 * Real Ed25519 signature verification for a wallet-ownership challenge.
 * Returns true only when the signature was produced by the private key
 * corresponding to `publicKey` over `message`.
 */
export function verifyEd25519(publicKey: PublicKey, message: Uint8Array, signature: Uint8Array): boolean {
  try {
    const keyObj = publicKeyToJwk(publicKey)
    return crypto.verify(null, Buffer.from(message), keyObj, Buffer.from(signature))
  } catch {
    return false
  }
}

export class WalletAuth {
  private connection: Connection
  private jwtSecret: string

  constructor(connection: Connection, jwtSecret: string) {
    if (!jwtSecret || jwtSecret.length < 16) {
      // Guard against accidentally running with a trivial/empty secret.
      // Operators must supply a strong secret (e.g. from env in production).
      throw new Error('WalletAuth requires a jwtSecret of at least 16 characters')
    }
    this.connection = connection
    this.jwtSecret = jwtSecret
  }

  /**
   * Off-chain wallet-ownership proof: the client signs a timestamped
   * challenge; we verify the Ed25519 signature against the claimed public
   * key. No on-chain RPC call is required for authentication itself.
   */
  async authenticateWallet(wallet: WalletAdapterLike): Promise<AuthSession> {
    if (!wallet.publicKey) {
      throw new Error('Wallet not connected')
    }

    const publicKey = wallet.publicKey
    const walletAddress = publicKey.toBase58()

    const message = this.buildChallenge(walletAddress)
    const messageBytes = new TextEncoder().encode(message)
    const signature = await wallet.signMessage(messageBytes)

    if (!verifyEd25519(publicKey, messageBytes, signature)) {
      throw new Error('Invalid signature')
    }

    const user = await this.getOrCreateUser(walletAddress, publicKey)
    const token = this.createJWT(user)

    return {
      token,
      user,
      expiresAt: new Date(Date.now() + DEFAULT_TOKEN_TTL_MS),
    }
  }

  /** Deterministic, time-bounded challenge message. */
  buildChallenge(walletAddress: string): string {
    return `Sign in to SolanaIdeasLab at ${new Date().toISOString()} for ${walletAddress}`
  }

  private getOrCreateUser(walletAddress: string, publicKey: PublicKey): AuthUser {
    const now = new Date()
    return {
      id: walletAddress,
      wallet: walletAddress,
      publicKey,
      subscriptionTier: 'free',
      createdAt: now,
      lastActive: now,
    }
  }

  /** Real HS256 JWT signing (no external dependency). */
  createJWT(user: AuthUser, ttlMs: number = DEFAULT_TOKEN_TTL_MS): string {
    const header = { alg: 'HS256', typ: 'JWT' }
    const payload = {
      sub: user.id,
      wallet: user.wallet,
      tier: user.subscriptionTier,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor((Date.now() + ttlMs) / 1000),
    }
    const headerB64 = b64url(JSON.stringify(header))
    const payloadB64 = b64url(JSON.stringify(payload))
    const signingInput = `${headerB64}.${payloadB64}`
    const sig = crypto.createHmac('sha256', this.jwtSecret).update(signingInput).digest('base64url')
    return `${signingInput}.${sig}`
  }

  /** Real HS256 JWT verification; returns null on any failure. */
  verifyToken(token: string): AuthUser | null {
    if (!token || typeof token !== 'string') return null
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [headerB64, payloadB64, sig] = parts
    const signingInput = `${headerB64}.${payloadB64}`
    const expectedSig = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(signingInput)
      .digest('base64url')
    // Constant-time comparison to avoid signature timing leaks.
    const a = Buffer.from(sig)
    const b = Buffer.from(expectedSig)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

    let payload: any
    try {
      payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'))
    } catch {
      return null
    }
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null

    let publicKey: PublicKey
    try {
      publicKey = new PublicKey(payload.wallet)
    } catch {
      return null
    }
    return {
      id: payload.sub,
      wallet: payload.wallet,
      publicKey,
      subscriptionTier: (payload.tier as SubscriptionTier) ?? 'free',
      createdAt: new Date(payload.iat * 1000),
      lastActive: new Date(),
    }
  }
}

export const createWalletAuth = (connection: Connection, jwtSecret: string): WalletAuth => {
  return new WalletAuth(connection, jwtSecret)
}
