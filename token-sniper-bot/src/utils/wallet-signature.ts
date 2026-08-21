import { randomBytes } from "node:crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";

const AUTH_MESSAGE_PREFIX = "SolanaIdeasLab Token Sniper Login";
export const MAX_AUTH_WINDOW_MS = 10 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;

const readPrefixedValue = (line: string | undefined, prefix: string): string | null =>
  line?.startsWith(prefix) ? line.slice(prefix.length) : null;

const parseAuthMessage = (
  walletAddress: string,
  message: string,
): { expiresAt: number; issuedAt: number; nonce: string } | null => {
  const lines = message.split("\n");
  if (lines.length !== 5 || lines[0] !== AUTH_MESSAGE_PREFIX) {
    return null;
  }

  const messageWalletAddress = readPrefixedValue(lines[1], "Wallet: ");
  const nonce = readPrefixedValue(lines[2], "Nonce: ");
  const issuedAtValue = readPrefixedValue(lines[3], "Issued At: ");
  const expiresAtValue = readPrefixedValue(lines[4], "Expires At: ");
  const issuedAt = Number(issuedAtValue);
  const expiresAt = Number(expiresAtValue);

  if (
    messageWalletAddress !== walletAddress ||
    !nonce ||
    !Number.isSafeInteger(issuedAt) ||
    !Number.isSafeInteger(expiresAt)
  ) {
    return null;
  }

  const now = Date.now();
  if (
    issuedAt > now + CLOCK_SKEW_MS ||
    expiresAt <= now ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > MAX_AUTH_WINDOW_MS
  ) {
    return null;
  }

  return { expiresAt, issuedAt, nonce };
};

export const buildWalletAuthMessage = (
  walletAddress: string,
  nonce: string,
  issuedAt = Date.now(),
): string => {
  const expiresAt = issuedAt + MAX_AUTH_WINDOW_MS;
  return [
    AUTH_MESSAGE_PREFIX,
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expires At: ${expiresAt}`,
  ].join("\n");
};

export const isFreshWalletAuthMessage = (
  walletAddress: string,
  message: string,
): boolean => Boolean(parseAuthMessage(walletAddress, message));

export const getWalletAuthNonce = (
  walletAddress: string,
  message: string,
): string | null => parseAuthMessage(walletAddress, message)?.nonce ?? null;

export const createWalletAuthChallenge = (
  walletAddress: string,
): { expiresAt: number; message: string; nonce: string } => {
  const nonce = randomBytes(32).toString("base64url");
  const issuedAt = Date.now();

  return {
    nonce,
    expiresAt: issuedAt + MAX_AUTH_WINDOW_MS,
    message: buildWalletAuthMessage(walletAddress, nonce, issuedAt),
  };
};

export const isValidWalletAddress = (walletAddress: string): boolean => {
  try {
    return bs58.decode(walletAddress).length === 32;
  } catch {
    return false;
  }
};

export const verifyWalletSignature = (
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

    return nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      signature,
      publicKeyBytes,
    );
  } catch {
    return false;
  }
};
