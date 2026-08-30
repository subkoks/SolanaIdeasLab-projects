import { isValidWalletAddress, verifyWalletSignature } from "../src/utils/wallet-signature";
import nacl from "tweetnacl";
import bs58 from "bs58";

describe("isValidWalletAddress", () => {
  it("accepts a valid 32-byte base58 Solana address", () => {
    const kp = nacl.sign.keyPair();
    const addr = bs58.encode(kp.publicKey);
    expect(addr.length).toBeGreaterThan(0);
    expect(isValidWalletAddress(addr)).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidWalletAddress("")).toBe(false);
  });

  it("rejects non-base58 input", () => {
    expect(isValidWalletAddress("0OIl")).toBe(false); // invalid base58 chars
    expect(isValidWalletAddress("not a real address!!!")).toBe(false);
  });

  it("rejects a base58 string that decodes to the wrong length", () => {
    // 31 bytes encoded -> decodes to 31, not 32
    const short = bs58.encode(new Uint8Array(31).fill(1));
    expect(isValidWalletAddress(short)).toBe(false);
    // 33 bytes encoded -> decodes to 33, not 32
    const long = bs58.encode(new Uint8Array(33).fill(1));
    expect(isValidWalletAddress(long)).toBe(false);
  });
});

describe("verifyWalletSignature", () => {
  it("returns false for a malformed signature", () => {
    const kp = nacl.sign.keyPair();
    const addr = bs58.encode(kp.publicKey);
    expect(verifyWalletSignature(addr, "hello", "not-a-signature")).toBe(false);
  });

  it("returns false for a valid address but wrong signature length", () => {
    const kp = nacl.sign.keyPair();
    const addr = bs58.encode(kp.publicKey);
    const badSig = bs58.encode(new Uint8Array(32).fill(2)); // 32 bytes, not 64
    expect(verifyWalletSignature(addr, "hello", badSig)).toBe(false);
  });

  it("accepts a correctly signed message", () => {
    const kp = nacl.sign.keyPair();
    const addr = bs58.encode(kp.publicKey);
    const message = "Sign in to SolanaIdeasLab at 2026";
    const sig = nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey);
    const sig58 = bs58.encode(sig);
    expect(verifyWalletSignature(addr, message, sig58)).toBe(true);
  });

  it("rejects a message signed by a different key", () => {
    const alice = nacl.sign.keyPair();
    const mallory = nacl.sign.keyPair();
    const message = "Sign in to SolanaIdeasLab at 2026";
    const sig = nacl.sign.detached(new TextEncoder().encode(message), mallory.secretKey);
    const sig58 = bs58.encode(sig);
    expect(verifyWalletSignature(bs58.encode(alice.publicKey), message, sig58)).toBe(false);
  });
});
