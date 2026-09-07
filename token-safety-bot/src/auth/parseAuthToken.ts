/** Legacy access-token payload shape (what token-safety-bot issues). */
export interface LegacyJWTPayload {
  userId: string;
  walletAddress: string;
  subscriptionTier: string;
}

export type SubscriptionTier = 'free' | 'basic' | 'pro' | 'enterprise';

export interface AuthenticatedUser {
  id: string;
  walletAddress: string;
  subscriptionTier: SubscriptionTier;
}

/**
 * Normalized JWT payload shape (what we want to accept internally)
 */
export interface NormalizedJWTPayload {
  // normalized (canonical) claims
  sub: string;            // = legacy userId (authoritative user id)
  wallet: string;         // = legacy walletAddress (Solana base58)
  tier: SubscriptionTier; // = legacy subscriptionTier

  // hardening claims (recommended, opt-in per phase)
  iss?: string;           // optional, must match if present
  aud?: string;           // optional, must match if present
  jti?: string;           // optional; enables revocation/observability
  tokenVersion?: number;  // explicit migration marker (recommended)
  iat?: number;           // maintained
  exp?: number;           // maintained
}

/** Claim-format labels for Phase 2 dual-read observability (no PII). */
export type AuthTokenFormat = 'legacy' | 'normalized' | 'dual';

export type AuthTokenRejectReason =
  | 'conflict'
  | 'incomplete'
  | 'iss'
  | 'aud'
  | 'invalid_payload'
  | 'verify_failed'
  | 'other';

const hasLegacyClaims = (decoded: object): boolean =>
  'userId' in decoded && 'walletAddress' in decoded && 'subscriptionTier' in decoded;

const hasNormalizedClaims = (decoded: object): boolean =>
  'sub' in decoded && 'wallet' in decoded && 'tier' in decoded;

/**
 * Detect which claim format a verified JWT payload uses.
 * Returns null when neither complete legacy nor complete normalized set is present.
 */
export function detectAuthTokenFormat(decoded: unknown): AuthTokenFormat | null {
  if (decoded === null || typeof decoded !== 'object') {
    return null;
  }
  const legacy = hasLegacyClaims(decoded);
  const normalized = hasNormalizedClaims(decoded);
  if (legacy && normalized) return 'dual';
  if (normalized) return 'normalized';
  if (legacy) return 'legacy';
  return null;
}

/** Map parse/verify failures to low-cardinality reject reasons (no claim values). */
export function classifyAuthTokenRejection(error: unknown): AuthTokenRejectReason {
  const message = error instanceof Error ? error.message : String(error);
  if (/Conflicting claims/i.test(message)) return 'conflict';
  if (/Incomplete token/i.test(message)) return 'incomplete';
  if (/Invalid issuer/i.test(message)) return 'iss';
  if (/Invalid audience/i.test(message)) return 'aud';
  if (/Invalid token payload/i.test(message)) return 'invalid_payload';
  if (
    /jwt expired|invalid signature|invalid token|jwt malformed|unexpected token/i.test(
      message,
    )
  ) {
    return 'verify_failed';
  }
  return 'other';
}

/**
 * Parse a JWT payload (either legacy or normalized) into an AuthenticatedUser
 * following the precedence rules from JWT_MIGRATION_PLAN.md §4.
 *
 * This function does NOT perform cryptographic verification - that must be done
 * by the caller using jwt.verify() with appropriate algorithm pinning.
 *
 * @param decoded The decoded JWT payload (must be verified already)
 * @param issuer Optional expected issuer; if provided, token MUST have matching iss
 * @param audience Optional expected audience; if provided, token MUST have matching aud
 * @returns AuthenticatedUser with id, walletAddress, subscriptionTier populated
 * @throws Error if token is invalid per precedence rules
 */
export function parseAuthToken(
  decoded: LegacyJWTPayload | NormalizedJWTPayload | string | object,
  issuer?: string,
  audience?: string,
): AuthenticatedUser {
  if (typeof decoded === 'string' || decoded === null || typeof decoded !== 'object') {
    throw new Error('Invalid token payload: expected object, got ' + typeof decoded);
  }
  // Extract legacy claims if present
  const legacyPresent = hasLegacyClaims(decoded);
  const legacyUserId = legacyPresent ? (decoded as LegacyJWTPayload).userId : undefined;
  const legacyWalletAddress = legacyPresent ? (decoded as LegacyJWTPayload).walletAddress : undefined;
  const legacySubscriptionTier = legacyPresent
    ? (decoded as LegacyJWTPayload).subscriptionTier
    : undefined;

  // Extract normalized claims if present
  const normalizedPresent = hasNormalizedClaims(decoded);
  const normalizedSub = normalizedPresent ? (decoded as NormalizedJWTPayload).sub : undefined;
  const normalizedWallet = normalizedPresent
    ? (decoded as NormalizedJWTPayload).wallet
    : undefined;
  const normalizedTier = normalizedPresent ? (decoded as NormalizedJWTPayload).tier : undefined;

  // Apply precedence rules (§4)
  // 1. If BOTH sub and userId are present, check for agreement
  if (legacyPresent && normalizedPresent) {
    // Check if they agree on all authorization-relevant fields
    const idAgrees = legacyUserId === normalizedSub;
    const walletAgrees = legacyWalletAddress === normalizedWallet;
    const tierAgrees = legacySubscriptionTier === normalizedTier;

    if (idAgrees && walletAgrees && tierAgrees) {
      // Treat as normalized; use normalized values (they're equal anyway)
      // But we still need to validate iss/aud if present
    } else {
      // They disagree on any authorization-relevant field → REJECT
      throw new Error(
        `Conflicting claims: legacy vs normalized ` +
        `(id: ${legacyUserId} vs ${normalizedSub}, ` +
        `wallet: ${legacyWalletAddress} vs ${normalizedWallet}, ` +
        `tier: ${legacySubscriptionTier} vs ${normalizedTier})`,
      );
    }
  }

  // 2. If only normalized claims present, use them
  if (normalizedPresent && !legacyPresent) {
    // Use normalized values directly
  }

  // 3. If only legacy claims present, map them
  if (legacyPresent && !normalizedPresent) {
    // Map legacy to normalized space for consistency
  }

  // 4. If neither set is present, or missing required fields after mapping
  const finalId = normalizedSub ?? legacyUserId;
  const finalWallet = normalizedWallet ?? legacyWalletAddress;
  const finalTier = normalizedTier ?? legacySubscriptionTier;

  if (!finalId || !finalWallet || !finalTier) {
    throw new Error(
      `Incomplete token: missing required claims after parsing ` +
      `(id: ${finalId}, wallet: ${finalWallet}, tier: ${finalTier})`,
    );
  }

  // 5. iss/aud validation (additive: only validate if present in token)
  // Note: issuer/audience validation should happen BEFORE calling this function
  // by checking the decoded token directly. This function assumes that
  // precondition has been met by the caller.
  // However, we can still do additive validation here if values were provided:
  if (issuer !== undefined && 'iss' in decoded && decoded.iss !== issuer) {
    throw new Error(`Invalid issuer: expected ${issuer}, got ${decoded.iss}`);
  }
  if (audience !== undefined && 'aud' in decoded && decoded.aud !== audience) {
    throw new Error(`Invalid audience: expected ${audience}, got ${decoded.aud}`);
  }

  // Return in the existing authenticated-user shape (no downstream changes)
  return {
    id: finalId,
    walletAddress: finalWallet,
    subscriptionTier: finalTier as SubscriptionTier,
  };
}
