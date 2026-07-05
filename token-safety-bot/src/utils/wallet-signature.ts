import bs58 from 'bs58'
import nacl from 'tweetnacl'

export const verifyWalletSignature = (
  walletAddress: string,
  message: string,
  signatureBase58: string,
): boolean => {
  try {
    const publicKeyBytes = bs58.decode(walletAddress)
    const signature = bs58.decode(signatureBase58)
    const messageBytes = new TextEncoder().encode(message)

    return nacl.sign.detached.verify(
      messageBytes,
      signature,
      publicKeyBytes,
    )
  } catch {
    return false
  }
}
