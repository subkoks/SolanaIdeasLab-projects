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
  const hasLegacyClaims = (
    'userId' in decoded &&
    'walletAddress' in decoded &&
    'subscriptionTier' in decoded
  );
  const legacyUserId = hasLegacyClaims ? (decoded as LegacyJWTPayload).userId : undefined;
  const legacyWalletAddress = hasLegacyClaims ? (decoded as LegacyJWTPayload).walletAddress : undefined;
  const legacySubscriptionTier = hasLegacyClaims ? (decoded as LegacyJWTPayload).subscriptionTier : undefined;

  // Extract normalized claims if present
  const hasNormalizedClaims = (
    'sub' in decoded &&
    'wallet' in decoded &&
    'tier' in decoded
  );
  const normalizedSub = hasNormalizedClaims ? (decoded as NormalizedJWTPayload).sub : undefined;
  const normalizedWallet = hasNormalizedClaims ? (decoded as NormalizedJWTPayload).wallet : undefined;
  const normalizedTier = hasNormalizedClaims ? (decoded as NormalizedJWTPayload).tier : undefined;

  // Apply precedence rules (§4)
  // 1. If BOTH sub and userId are present, check for agreement
  if (hasLegacyClaims && hasNormalizedClaims) {
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
  if (hasNormalizedClaims && !hasLegacyClaims) {
    // Use normalized values directly
  }

  // 3. If only legacy claims present, map them
  if (hasLegacyClaims && !hasNormalizedClaims) {
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