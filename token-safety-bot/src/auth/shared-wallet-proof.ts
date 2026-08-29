import bs58 from "bs58";
import { verifyEd25519WalletAuth } from "@solanaideaslab/shared";

/**
 * Additive wallet-proof verification that delegates the raw Ed25519 signature
 * check to the canonical `@solanaideaslab/shared` primitive
 * (`verifyEd25519WalletAuth`), instead of the bot's local tweetnacl call.
 *
 * This module intentionally performs ONLY signature verification. All
 * challenge/nonce/expiry/replay policy remains the bot's responsibility
 * (see `src/utils/wallet-signature.ts`) so the existing auth flow is never
 * weakened. The bot's JWT issuance, `jsonwebtoken` middleware, token claim
 * names, payload shape, and user model are untouched by this file.
 *
 * Behavior is equivalent to `verifyWalletSignature` in wallet-signature.ts;
 * this exists so the bot consumes one audited shared implementation.
 */
export const verifyWalletSignatureWithShared = (
  walletAddress: string,
  message: string,
  signatureBase58: string,
): boolean => {
  try {
    const publicKeyBytes = bs58.decode(walletAddress);
    const signature = bs58.decode(signatureBase58);
    if (publicKeyBytes.length !== 32 || signature.length !== 64) {
      return false;
    }

    const verifier = new verifyEd25519WalletAuth(walletAddress);
    return verifier.verify(
      new TextEncoder().encode(message),
      signature,
    );
  } catch {
    return false;
  }
};
