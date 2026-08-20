import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  buildWalletAuthMessage,
  isFreshWalletAuthMessage,
  verifyWalletSignature,
} from "../src/utils/wallet-signature";

describe("wallet signature verification", () => {
  it("accepts a valid, unexpired wallet login message", () => {
    const keyPair = nacl.sign.keyPair();
    const walletAddress = bs58.encode(keyPair.publicKey);
    const message = buildWalletAuthMessage(walletAddress);
    const signature = bs58.encode(
      nacl.sign.detached(new TextEncoder().encode(message), keyPair.secretKey),
    );

    expect(isFreshWalletAuthMessage(walletAddress, message)).toBe(true);
    expect(verifyWalletSignature(walletAddress, message, signature)).toBe(true);
  });

  it("rejects expired or mismatched login messages", () => {
    const keyPair = nacl.sign.keyPair();
    const walletAddress = bs58.encode(keyPair.publicKey);
    const expiredMessage = buildWalletAuthMessage(
      walletAddress,
      Date.now() - 11 * 60 * 1000,
    );
    const otherWallet = bs58.encode(nacl.sign.keyPair().publicKey);

    expect(isFreshWalletAuthMessage(walletAddress, expiredMessage)).toBe(false);
    expect(
      isFreshWalletAuthMessage(walletAddress, buildWalletAuthMessage(otherWallet)),
    ).toBe(false);
  });
});
